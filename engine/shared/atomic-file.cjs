const fs = require('node:fs/promises');
const {setTimeout: delay} = require('node:timers/promises');

// Windows readers can briefly prevent replacement. Keep the old report intact
// and retry the rename, rather than deleting it or exposing partial JSON.
async function replace(source, destination, {rename = fs.rename, platform = process.platform} = {}) {
  for (let attempt = 0; ; attempt++) {
    try {return await rename(source, destination);}
    catch (error) {
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 10)
        throw error;
      await delay(10 * (attempt + 1));
    }
  }
}

module.exports = {replace};
