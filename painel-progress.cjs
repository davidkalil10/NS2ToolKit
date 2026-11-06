const {format} = require('node:util');

function emit(kind, fields = {}) {
  process.stdout.write('PANEL:' + JSON.stringify({kind, at: new Date().toISOString(), ...fields}) + '\n');
}

class Progress {
  constructor(send = emit) {this.send = send; this.phase = 'initial'; this.operation = ''; this.started = Date.now();}
  begin(phase, operation) {
    this.phase = phase; this.operation = operation; this.started = Date.now();
    this.tick();
  }
  snapshot() {return {phase: this.phase, operation: this.operation, nativeOperation: this.nativeOperation || '', elapsedSeconds: Math.floor((Date.now() - this.started) / 1000)};}
  tick() {this.send('phase', this.snapshot());}
  start() {this.timer = setInterval(() => this.tick(), 1000); this.timer.unref();}
  close() {clearInterval(this.timer);}
  async openings(action) {
    const original = console.log;
    console.log = (...args) => {
      original(...args);
      const match = /^Opening (\/\S+)/.exec(format(...args));
      if (match) this.begin('prepare', match[1]);
    };
    try {return await action();}
    finally {console.log = original;}
  }
}

function failureDetails(error, context = {}, cleanupErrors = []) {
  const message = String(error?.message || error);
  let category = 'operation_failed', summary = 'A operação não terminou. Confira os detalhes nos registros.';
  if (/timed out|timeout/i.test(message)) {
    category = 'response_timeout'; summary = 'A operação perdeu a resposta. Encerre a sessão e reinicie o console.';
  } else if (/original-content mount|standalone ES preparation/i.test(message)) {
    category = 'unsupported_content'; summary = 'Este conteúdo exige uma forma de montagem ainda não suportada.';
  } else if (/not ready|ENOENT.*(?:pipe|sock)|disconnected|connection closed|SESSION LOST/i.test(message)) {
    category = 'session_lost'; summary = 'A conexão com o console foi encerrada. Inicie uma sessão nova.';
  } else if (/cancelad/i.test(message)) {
    category = 'cancelled'; summary = 'Operação cancelada; os arquivos parciais foram preservados.';
  }
  const details = [...new Set([message, ...cleanupErrors.map(e => String(e.message || e))])];
  return {category, summary, message: details.join('\n'), ...context,
    cleanupConfirmed: cleanupErrors.length === 0, requiresRestart: true};
}

async function closeAttachment(attachment) {
  if (!attachment) return;
  await attachment.close();
  const s = attachment.s;
  if (s && (s.base || s.handles?.size || s.threads?.size))
    throw Error('A limpeza da sessão auxiliar não foi confirmada. Reinicie o console.');
}

module.exports = {emit, Progress, failureDetails, closeAttachment};
