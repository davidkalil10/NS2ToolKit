const fs = require('node:fs/promises');
const path = require('node:path');

function gameLabel(name, title) {
  title = String(title).toUpperCase();
  if (!/^[0-9A-F]{16}$/.test(title)) throw Error('Identificador do jogo inválido.');
  let text = String(name || '').normalize('NFC').replace(/\p{C}/gu, '')
    .replace(/[<>:"/\\|?*]+/g, ' - ').replace(/\s+/gu, ' ').replace(/^[ .-]+|[ .-]+$/g, '');
  if (!text || text.toUpperCase() === title) text = 'Jogo';
  text = Array.from(text).slice(0, 60).join('').replace(/[ .-]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
  return `${text} [${title}]`;
}

async function newDirectory(parent, label) {
  parent = path.resolve(parent);
  await fs.mkdir(parent, {recursive: true});
  for (let n = 1; n < 10000; n++) {
    const candidate = path.join(parent, label + (n === 1 ? '' : ` (${n})`));
    try {await fs.mkdir(candidate); return candidate;}
    catch (error) {if (error.code !== 'EEXIST') throw error;}
  }
  throw Error('Há muitas pastas com o mesmo nome. Escolha outro destino.');
}

module.exports = {gameLabel, newDirectory};
