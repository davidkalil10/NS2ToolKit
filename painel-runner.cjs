const readline = require('node:readline');

async function runControlled(main, args) {
  const input = readline.createInterface({input: process.stdin});
  input.on('line', line => {
    if (line !== 'stop') return;
    // The held upstream runner installs this handler after its 4/4 checks.
    // Invoke it in the same process so it can retire the endpoint normally.
    if (process.listenerCount('SIGINT')) process.emit('SIGINT');
    else console.error('A sessão ainda não está pronta para encerramento com limpeza.');
  });
  try {return await main(args);}
  finally {input.close(); process.stdin.pause();}
}

module.exports = {runControlled};
if (require.main === module)
  runControlled(require('./run.cjs').main, process.argv.slice(2))
    .catch(error => {console.error(error.message); process.exitCode = 1;});
