// Existing-file, equal-size restoration. Acquisition and upstream engine stay unchanged.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const reader = require('./painel-save-reader.cjs');
const {build} = require('./tools/ns2-savekit/tools/lib/save-attr.cjs');
const {replace} = require('./engine/shared/atomic-file.cjs');
const {closeAttachment} = require('./painel-progress.cjs');
const assert = (ok, message) => {if (!ok) throw Error(message);};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_TOTAL = 64 * 1024 * 1024, MAX_FILE = 16 * 1024 * 1024;
const identityFields = ['id', 'title', 'uid', 'space', 'type', 'rank', 'index'];
function refuseUnless(ok, message) {if (!ok) {const error = Error(message); error.restoreRefusal = true; throw error;}}
const identity = entry => Object.fromEntries(identityFields.map(key => [key, entry[key]]));
const sameIdentity = (a, b) => identityFields.every(key => a[key] === b[key]);
function remotePath(text) {
  assert(typeof text === 'string' && text.startsWith('/') && !/[\\\0\r\n]/.test(text) &&
    Buffer.byteLength(text) < 0x301 && text.split('/').slice(1).every(p => p && p !== '.' && p !== '..'), 'Caminho de save inválido.');
  return text;
}
async function containedFile(folder, relative) {
  assert(typeof relative === 'string' && !path.isAbsolute(relative), 'Caminho local inválido.');
  const normalized = relative.replace(/\\/g, '/');
  assert(normalized.split('/').every(p => p && p !== '.' && p !== '..' && !p.includes(':')), 'Caminho local inválido.');
  let current = folder;
  for (const part of normalized.split('/')) {
    current = path.join(current, part);
    assert(!(await fs.lstat(current)).isSymbolicLink(), 'Links não são aceitos na restauração.');
  }
  const real = await fs.realpath(current), rel = path.relative(await fs.realpath(folder), real);
  assert(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && (await fs.stat(real)).isFile(), 'Arquivo fora da pasta selecionada.');
  return real;
}
async function jsonWrite(file, value) {
  const temporary = file + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  await replace(temporary, file);
}
async function inspect(source) {
  source = await fs.realpath(source);
  const manifestFile = await containedFile(source, 'manifest.json');
  const raw = await fs.readFile(manifestFile), manifest = JSON.parse(raw);
  assert(manifest.format === 'ns2toolkit-save-v1' && manifest.complete === true && manifest.dataVerified === true &&
    manifest.cleanupConfirmed === true && !manifest.error && !manifest.pendingFile, 'Selecione um backup de save concluído e com limpeza confirmada.');
  assert(reader.supported(manifest.archive), 'Identidade de save não suportada.');
  assert(Array.isArray(manifest.entries) && manifest.entries.length > 0 && manifest.entries.length <= 256, 'Quantidade de arquivos não suportada.');
  const files = [], seen = new Set(); let total = 0;
  for (const entry of manifest.entries) {
    remotePath(entry.path);
    assert(!seen.has(entry.path.toLowerCase()), 'Arquivo duplicado no manifesto.'); seen.add(entry.path.toLowerCase());
    assert(/^data[\\/]/.test(entry.local || '') && /^[a-f0-9]{64}$/.test(entry.sha256 || '') &&
      Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= MAX_FILE, 'Entrada de backup inválida ou grande demais.');
    const file = await containedFile(source, entry.local);
    assert((await fs.stat(file)).size === entry.size, 'Esta versão só restaura arquivos com o tamanho original: ' + entry.path);
    const bytes = await fs.readFile(file);
    assert(bytes.length === entry.size, 'Esta versão só restaura arquivos com o tamanho original: ' + entry.path);
    total += bytes.length; assert(total <= MAX_TOTAL, 'Restauração limitada a 64 MiB nesta versão.');
    const hash = sha(bytes);
    files.push({path: entry.path, local: entry.local, size: bytes.length, originalSha256: entry.sha256,
      sha256: hash, edited: hash !== entry.sha256});
  }
  return {source, manifestSha256: sha(raw), archive: identity(manifest.archive), name: manifest.name, files};
}
async function nativeOpen(a, entry, writable) {
  const input = build({space: entry.space, referenceId: BigInt('0x' + entry.title), uid: Buffer.from(entry.uid, 'hex'),
    type: entry.type, rank: entry.rank, index: entry.index});
  const reply = await a.s.ipc(writable ? 'Open selected save read-write' : 'Open selected save read-only', a.root, writable ? 51 : 53, input);
  assert(!reply.result, 'Não foi possível abrir o save: 0x' + Number(reply.result).toString(16));
  return a.domain.oneHandle(reply);
}
async function snapshot(a, handle, stop = () => false) {
  const tree = await reader.scan(a, handle, stop); let total = 0;
  assert(tree.files.length <= 256, 'O save atual excede o limite de arquivos.');
  const entries = [];
  for (const file of tree.files) {
    total += file.size;
    assert(file.size <= MAX_FILE && total <= MAX_TOTAL, 'O save atual excede o limite de tamanho.');
    const opened = await a.filesystem.openFile(a.s, handle, file.path);
    assert(!opened.result, 'Arquivo atual não abriu: ' + file.path);
    const hash = crypto.createHash('sha256');
    try {
      assert(Number(await a.filesystem.fileSize(a.s, opened.handle)) === file.size, 'O save mudou durante a verificação.');
      for (let offset = 0; offset < file.size;) {
        refuseUnless(!stop(), 'Restauração cancelada antes da escrita.');
        const wanted = Math.min(0x40000, file.size - offset);
        const bytes = await a.filesystem.readFile(a.s, opened.handle, offset, wanted);
        assert(bytes.length > 0 && bytes.length <= wanted, 'Leitura incompleta do save atual.');
        hash.update(bytes); offset += bytes.length;
      }
      assert(Number(await a.filesystem.fileSize(a.s, opened.handle)) === file.size, 'O save mudou durante a verificação.');
    } finally {await a.s.close(opened.handle);}
    entries.push({path: file.path, size: file.size, sha256: hash.digest('hex')});
  }
  return {entries, directories: tree.directories};
}
function comparable(manifest) {
  return {entries: manifest.entries.map(e => ({path: e.path, size: e.size, sha256: e.sha256})).sort((a,b) => a.path.localeCompare(b.path)),
    directories: [...manifest.directories].sort()};
}
function sameSnapshot(a, b) {return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));}
async function prepare({run, source, parent, selected, allowEdited, targetId, stop = () => false, send = () => {}, attach}) {
  const input = await inspect(source);
  assert(targetId === undefined || targetId === input.archive.id, 'O destino selecionado não corresponde ao jogo e usuário do backup.');
  assert(Array.isArray(selected) && selected.length > 0 && new Set(selected).size === selected.length, 'Selecione os arquivos a restaurar.');
  const jobs = selected.map(name => {const file = input.files.find(f => f.path === name); assert(file, 'Arquivo selecionado ausente.'); return file;});
  assert(allowEdited || jobs.every(f => !f.edited), 'Confirme o uso dos arquivos editados. O manifesto original foi preservado.');
  const {newDirectory, gameLabel} = require('./painel-names.cjs');
  parent = path.resolve(parent);
  const outside = folder => {const rel = path.relative(input.source, folder); return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);};
  assert(outside(parent), 'Use uma pasta de preparação fora do backup de origem.');
  await fs.mkdir(parent, {recursive:true});
  parent = await fs.realpath(parent);
  assert(outside(parent), 'A pasta de preparação aponta para dentro do backup de origem.');
  const folder = await newDirectory(parent, gameLabel(input.name, input.archive.title));
  await fs.mkdir(path.join(folder, 'payload'));
  send('destination', {path: folder});
  for (let i = 0; i < jobs.length; i++) {
    const bytes = await fs.readFile(await containedFile(input.source, jobs[i].local));
    assert(sha(bytes) === jobs[i].sha256, 'O arquivo de origem mudou durante a preparação.');
    jobs[i] = {...jobs[i], payload: 'payload/' + i + '.bin'};
    await fs.writeFile(path.join(folder, jobs[i].payload), bytes, {flag:'wx', mode:0o600});
  }
  let a, baseline, failure, nativeTouched = false;
  try {
    assert(!stop(), 'Preparação cancelada.');
    nativeTouched = true; a = await attach(run);
    const current = (await reader.inventory(a, stop)).find(e => sameIdentity(e, input.archive));
    refuseUnless(current && reader.supported(current), 'O save/usuário do backup não corresponde ao inventário atual do console.');
    send('status', {message:'Criando pré-backup do estado atual do console...'});
    baseline = await reader.copyArchive(a, current, path.join(folder, 'pre-backup'), {stop, send: (kind, fields) => {if (kind !== 'destination') send(kind, fields);}, name: input.name});
    assert(!stop(), 'Preparação cancelada.');
  } catch (error) {failure = error; if (stop() && /^(Backup cancelado|Preparação cancelada)/.test(error.message)) error.restoreRefusal = true;}
  finally {
    try {await closeAttachment(a);} catch (error) {if (failure) (failure.cleanupErrors ||= []).push(error.message); else failure = error;}
    if (baseline) {
      baseline.manifest.complete = !failure; baseline.manifest.cleanupConfirmed = !failure?.cleanupErrors && !a?.s?.base;
      if (failure) baseline.manifest.error = failure.message;
      await reader.writeManifest(baseline.folder, baseline.manifest);
    }
  }
  if (failure) {failure.nativeTouched = nativeTouched; throw failure;}
  for (const job of jobs) {
    const before = baseline.manifest.entries.find(e => e.path === job.path);
    assert(before && before.size === job.size, 'Arquivo ausente ou com tamanho diferente no console: ' + job.path);
    job.beforeSha256 = before.sha256;
  }
  const baselineRel = path.relative(folder, path.join(baseline.folder, 'manifest.json')).replace(/\\/g,'/');
  const plan = {format:'ns2toolkit-restore-plan-v1', run: await fs.realpath(run), at: new Date().toISOString(),
    archive: input.archive, name: input.name, source: input.source, sourceManifestSha256: input.manifestSha256,
    baseline: baselineRel, baselineSha256: sha(await fs.readFile(path.join(baseline.folder, 'manifest.json'))), files: jobs};
  const file = path.join(folder, 'restore-plan.json'); await jsonWrite(file, plan);
  return {planPath: file, planSha256: sha(await fs.readFile(file)), backupFolder: baseline.folder,
    title: plan.archive.title, uid: plan.archive.uid, name: plan.name, files: jobs};
}
async function writeExisting(a, handle, job, bytes, started) {
  const mode = Buffer.alloc(4); mode.writeUInt32LE(3);
  const reply = await a.filesystem.pathMethod(a.s, handle, 8, job.path, mode);
  assert(!reply.result, 'Arquivo existente não abriu para escrita: ' + job.path);
  const file = a.domain.oneHandle(reply);
  try {
    assert(Number(await a.filesystem.fileSize(a.s, file)) === bytes.length, 'O tamanho do arquivo atual mudou.');
    for (let offset = 0; offset < bytes.length;) {
      const chunk = bytes.subarray(offset, offset + 0x10000), buffer = a.s.base + 0x20000;
      await a.s.write(buffer, chunk);
      assert(await a.filesystem.nativeHash(a.s, buffer, chunk.length) === sha(chunk), 'O envio do bloco ao console não foi confirmado.');
      const input = Buffer.alloc(24); input.writeBigUInt64LE(BigInt(offset), 8); input.writeBigUInt64LE(BigInt(chunk.length), 16);
      await started();
      const written = await a.s.ipc('Restore FileWrite', file, 1, input, {send:[{address:buffer,size:chunk.length,mode:1}]});
      assert(!written.result, 'Falha ao escrever ' + job.path + ': ' + written.result);
      offset += chunk.length;
    }
    const flushed = await a.s.ipc('Restore FileFlush', file, 2);
    assert(!flushed.result, 'Falha ao descarregar o arquivo no save.');
  } finally {await a.s.close(file);}
}
async function apply({run, planPath, planSha256, confirmed, stop = () => false, send = () => {}, attach}) {
  assert(confirmed === true, 'A restauração exige confirmação explícita do plano.');
  planPath = await fs.realpath(planPath); const folder = path.dirname(planPath);
  const raw = await fs.readFile(planPath);
  assert(/^[a-f0-9]{64}$/.test(planSha256 || '') && sha(raw) === planSha256, 'O plano mudou após a preparação. Prepare novamente.');
  const plan = JSON.parse(raw);
  assert(plan.format === 'ns2toolkit-restore-plan-v1' && plan.run === await fs.realpath(run) && reader.supported(plan.archive), 'Plano de outra sessão ou identidade inválida.');
  assert(Array.isArray(plan.files) && plan.files.length > 0 && plan.files.length <= 256, 'Plano sem arquivos válidos.');
  const baselineFile = await containedFile(folder, plan.baseline), baselineBytes = await fs.readFile(baselineFile);
  assert(sha(baselineBytes) === plan.baselineSha256, 'O pré-backup mudou. Prepare novamente.');
  const baseline = JSON.parse(baselineBytes);
  assert(baseline.format === 'ns2toolkit-save-v1' && baseline.complete && baseline.dataVerified && baseline.cleanupConfirmed &&
    sameIdentity(baseline.archive, plan.archive), 'Pré-backup incompleto ou de outro save.');
  for (const entry of baseline.entries) {
    const saved = await containedFile(path.dirname(baselineFile), entry.local);
    assert(sha(await fs.readFile(saved)) === entry.sha256, 'O pré-backup não passou na conferência de integridade.');
  }
  const jobs = []; let total = 0; const seen = new Set();
  for (const job of plan.files) {
    remotePath(job.path); assert(!seen.has(job.path), 'Plano com caminhos duplicados.'); seen.add(job.path);
    const before = baseline.entries.find(e => e.path === job.path);
    const bytes = await fs.readFile(await containedFile(folder, job.payload));
    total += bytes.length;
    assert(bytes.length <= MAX_FILE && total <= MAX_TOTAL && before && before.size === job.size &&
      bytes.length === job.size && sha(bytes) === job.sha256 && before.sha256 === job.beforeSha256, 'Arquivo preparado ou pré-backup divergente.');
    jobs.push({job, bytes});
  }
  const report = {format:'ns2toolkit-restore-result-v1', complete:false, writesStarted:false, commitAttempted:false,
    committed:false, verified:false, cleanupConfirmed:false, planSha256, preBackup:path.dirname(baselineFile), at:new Date().toISOString()};
  const reportFile = path.join(folder, 'restore-report.json');
  assert(!(await fs.stat(reportFile).catch(e => {if (e.code === 'ENOENT') return null; throw e;})), 'Este plano já foi executado ou tentado. Prepare uma nova restauração.');
  await jsonWrite(reportFile, report);
  let a, handle, failure, nativeTouched = false;
  try {
    assert(!stop(), 'Restauração cancelada antes da escrita.');
    nativeTouched = true; a = await attach(run);
    refuseUnless((await reader.inventory(a, stop)).some(e => sameIdentity(e, plan.archive)), 'O save atual não corresponde ao plano.');
    handle = await nativeOpen(a, plan.archive, true);
    send('status', {message:'Conferindo se o save do console mudou desde o pré-backup...'});
    refuseUnless(sameSnapshot(await snapshot(a, handle, stop), baseline), 'O save do console mudou após a preparação. Faça um novo pré-backup.');
    refuseUnless(!stop(), 'Restauração cancelada antes da escrita.');
    for (const {job, bytes} of jobs) {
      await writeExisting(a, handle, job, bytes, async () => {
        if (!report.writesStarted) {
          refuseUnless(!stop(), 'Restauração cancelada antes da escrita.');
          report.writesStarted = true; await jsonWrite(reportFile, report);
          send('writing', {message:'Gravando o save. Aguarde o commit e a verificação; não encerre a conexão.'});
        }
      });
    }
    const expected = {...baseline, entries: baseline.entries.map(e => {
      const replacement = plan.files.find(j => j.path === e.path);
      return replacement ? {...e, sha256:replacement.sha256} : e;
    })};
    assert(sameSnapshot(await snapshot(a, handle), expected), 'A conferência antes do commit encontrou divergência.');
    if (!report.writesStarted) refuseUnless(!stop(), 'Restauração cancelada antes da escrita.');
    report.commitAttempted = true; await jsonWrite(reportFile, report);
    const commit = await a.s.ipc('Commit restored save filesystem', handle, 10);
    assert(!commit.result, 'O commit do save não foi confirmado: ' + commit.result);
    report.committed = true; await jsonWrite(reportFile, report);
    await a.s.close(handle); handle = undefined;
    handle = await nativeOpen(a, plan.archive, false);
    send('status', {message:'Relendo o save após o commit e conferindo todos os arquivos...'});
    assert(sameSnapshot(await snapshot(a, handle), expected), 'A releitura após o commit encontrou divergência.');
    report.verified = true;
  } catch (error) {
    failure = error;
    if (!report.writesStarted && !report.commitAttempted && stop() && /^(Backup cancelado|Restauração cancelada)/.test(error.message)) error.restoreRefusal = true;
  }
  finally {
    try {if (handle !== undefined) await a.s.close(handle);} catch (error) {failure ||= error; (failure.cleanupErrors ||= []).push(error.message);}
    try {await closeAttachment(a); report.cleanupConfirmed = true;} catch (error) {failure ||= error; (failure.cleanupErrors ||= []).push(error.message);}
    report.complete = !failure && report.verified && report.cleanupConfirmed;
    if (failure) {report.error = failure.message; failure.nativeTouched = nativeTouched; failure.writesStarted = report.writesStarted || report.commitAttempted;}
    try {await jsonWrite(reportFile, report);} catch (error) {error.nativeTouched = nativeTouched; error.writesStarted = report.writesStarted || report.commitAttempted; throw error;}
  }
  if (failure) throw failure;
  return {reportPath:reportFile, backupFolder:report.preBackup, files:plan.files.map(f => f.path)};
}
module.exports = {inspect, prepare, apply, sameIdentity, sameSnapshot, snapshot, writeExisting};
