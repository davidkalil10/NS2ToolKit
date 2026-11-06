const readline = require('node:readline');

async function runControlled(main, args) {
  const input = readline.createInterface({input: process.stdin});
  let pendingStop;
  const requestStop = () => {
    if (process.listenerCount('SIGINT')) {
      clearInterval(pendingStop); pendingStop = null; process.emit('SIGINT');
    } else if (!pendingStop) {
      // A cancel click can arrive while the helper is still validating files.
      // Deliver it when that helper has installed its cooperative stop handler.
      pendingStop = setInterval(requestStop, 25); pendingStop.unref();
    }
  };
  input.on('line', line => {
    if (line !== 'stop') return;
    // The held upstream runner installs this handler after its 4/4 checks.
    // Invoke it in the same process so it can retire the endpoint normally.
    requestStop();
  });
  try {return await main(args);}
  finally {clearInterval(pendingStop); input.close(); process.stdin.pause();}
}

module.exports = {runControlled};
if (require.main === module)
  runControlled(require('./run.cjs').main, process.argv.slice(2))
    .catch(error => {console.error(error.message); process.exitCode = 1;});
