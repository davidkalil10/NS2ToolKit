const test = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

test('Windows panel can request upstream cleanup over stdin without killing the held process', async () => {
  const code = `const {runControlled}=require(${JSON.stringify(path.join(__dirname, 'painel-runner.cjs'))});
    runControlled(async()=>{await new Promise(resolve=>{
      process.once('SIGINT',resolve); console.log('READY');
    }); console.log('CLEANED');},[]).catch(()=>process.exitCode=1);`;
  const child = spawn(process.execPath, ['-e', code], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
  let output = '', error = '', sent = false;
  const timeout = setTimeout(() => child.kill(), 5000);
  child.stdout.on('data', part => {
    output += part;
    if (!sent && output.includes('READY')) {sent = true; child.stdin.write('stop\n');}
  });
  child.stderr.on('data', part => {error += part;});
  try {
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);});
    assert.equal(code, 0, error);
    assert.ok(output.includes('CLEANED'));
  } finally {clearTimeout(timeout);}
});

test('acquisition stops after uncertain cleanup and preserves the first failure; clean failures stay retryable', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ns2-acquisition-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  for (const cleanedUp of [false, true]) {
    const base = path.join(root, String(cleanedUp)), engine = path.join(base, 'switch2');
    for (const name of ['shared', 'switch2/tools', 'switch2/memory', 'switch2/ro']) await fs.mkdir(path.join(base, name), {recursive: true});
    await fs.copyFile(path.join(__dirname, 'engine/switch2/acquire.cjs'), path.join(engine, 'acquire.cjs'));
    await fs.writeFile(path.join(base, 'shared/rpc.cjs'), 'exports.a={session:"fixture"};');
    await fs.writeFile(path.join(engine, 'tools/endpoint.cjs'), 'exports.request=async()=>{};');
    await fs.writeFile(path.join(engine, 'memory/verify-proof.cjs'), 'exports.verifyProof=async()=>{};');
    await fs.writeFile(path.join(engine, 'ro/runtime.cjs'), `const fs=require('node:fs/promises');
      exports.read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
      exports.save=async(f,v)=>fs.writeFile(f,JSON.stringify(v));`);
    await fs.writeFile(path.join(engine, 'memory/probe-reserved-gap.cjs'), `const fs=require('node:fs');const path=require('node:path');
      const counter=path.join(__dirname,'starts.txt');fs.appendFileSync(counter,'started\\n');
      const file=path.join(__dirname,'report.json');fs.writeFileSync(file,JSON.stringify({cleanedUp:${cleanedUp},error:'Error: first native failure\\nstack'}));
      console.log(JSON.stringify({stage:'connected',file}));process.exitCode=1;`);
    const {start} = require(path.join(engine, 'acquire.cjs'));
    await assert.rejects(start(), /FS acquisition failed: first native failure/);
    const launches = (await fs.readFile(path.join(engine, 'memory/starts.txt'), 'utf8')).trim().split('\n');
    assert.equal(launches.length, cleanedUp ? 3 : 1);
    assert.ok((await fs.readFile(path.join(engine, 'acquisition-attempt-1.log'), 'utf8')).includes('connected'));
  }
});

test('a cancel received during helper startup is delivered after its handler is installed', async () => {
  const code = `const {runControlled}=require(${JSON.stringify(path.join(__dirname, 'painel-runner.cjs'))});
    runControlled(async()=>{await new Promise(r=>setTimeout(r,150));
      await new Promise(r=>process.once('SIGINT',r));console.log('CANCELLED');},[]);`;
  const child = spawn(process.execPath, ['-e', code], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
  let output = '';
  child.stdout.on('data', part => {output += part;});
  const timer = setTimeout(() => child.kill(), 5000);
  child.stdin.write('stop\n');
  try {
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);});
    assert.equal(code, 0); assert.ok(output.includes('CANCELLED'));
  } finally {clearTimeout(timer);}
});
