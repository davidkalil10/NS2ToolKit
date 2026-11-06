"""Readable, collision-safe Windows directory names; game IDs stay intact."""
from pathlib import Path
import re
import unicodedata


def game_label(name, title):
    title = str(title).upper()
    if not re.fullmatch(r'[0-9A-F]{16}', title):
        raise ValueError('Identificador do jogo inválido.')
    text = unicodedata.normalize('NFC', str(name or ''))
    text = ''.join(c for c in text if not unicodedata.category(c).startswith('C'))
    text = re.sub(r'[<>:"/\\|?*]+', ' - ', text)
    text = re.sub(r'\s+', ' ', text).strip(' .-')
    if not text or text.upper() == title:
        text = 'Jogo'
    text = text[:60].rstrip(' .-')
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', text, re.I):
        text = '_' + text
    return f'{text} [{title}]'


def new_directory(parent, label):
    parent = Path(parent).resolve()
    parent.mkdir(parents=True, exist_ok=True)
    for number in range(1, 10000):
        candidate = parent / (label if number == 1 else f'{label} ({number})')
        try:
            candidate.mkdir()
            return candidate
        except FileExistsError:
            continue
    raise ValueError('Há muitas pastas com o mesmo nome. Escolha outro destino.')
