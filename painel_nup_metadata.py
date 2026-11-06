"""SPEC v1 metadata compatibility for the pinned NUP reference revision.

That revision's TVL enum starts at zero; SPEC section 5 and Eglantine expect
1..10. Override the exported format constants in this process only, leaving
the submodule untouched. Unknown upstream layouts are refused.
"""
from pathlib import Path


def use_spec_metadata(format_module):
    names = ('NPDM', 'NACP', 'ICON', 'DISPLAY_VERSION', 'TITLE_NAME', 'PUBLISHER',
             'BUILD_ID', 'SOURCE_DUMP', 'LOCALIZED_TITLES', 'LOCALIZED_ICONS')
    current = [int(getattr(format_module, 'TLV_' + name)) for name in names]
    if current not in [list(range(10)), list(range(1, 11))]:
        raise ValueError('Revisão NUP com identificadores de metadados desconhecidos.')
    for number, name in enumerate(names, 1):
        setattr(format_module, 'TLV_' + name, number)


LANGUAGES = ('en-us', 'en-gb', 'ja', 'fr', 'de', 'es-419', 'es', 'it', 'nl',
             'fr-ca', 'pt', 'ru', 'ko', 'zh-hant', 'zh-hans', 'pt-br')
ICON_LANGUAGES = ('AmericanEnglish', 'BritishEnglish', 'Japanese', 'French', 'German',
                  'LatinAmericanSpanish', 'Spanish', 'Italian', 'Dutch', 'CanadianFrench',
                  'Portuguese', 'Russian', 'Korean', 'TraditionalChinese', 'SimplifiedChinese',
                  'BrazilianPortuguese')


def text_field(raw):
    try:
        value = raw.split(b'\0')[0].decode('utf-8').strip()
    except UnicodeDecodeError:
        return None
    if value and '\ufffd' not in value and all(ord(c) >= 32 for c in value) and any(c.isalnum() for c in value):
        return value
    return None


def control_metadata(stage, name):
    stage = Path(stage)
    updates = stage / 'updates'
    roots = sorted((p for p in updates.iterdir() if p.is_dir() and p.name.isdecimal()),
                   key=lambda p: int(p.name), reverse=True) if updates.exists() else []
    roots.append(stage / 'base')
    names, icons = {}, {}
    publisher = version = None
    for root in roots:
        control = root / 'data/control'
        nacp = control / 'control.nacp'
        if nacp.is_file() and nacp.stat().st_size == 0x4000:
            raw = nacp.read_bytes()
            for index, lang in enumerate(LANGUAGES):
                title = text_field(raw[index * 0x300:index * 0x300 + 0x200])
                if title:
                    names.setdefault(lang, title)
                    publisher = publisher or text_field(raw[index * 0x300 + 0x200:(index + 1) * 0x300])
            version = version or text_field(raw[0x3060:0x3070])
        for lang, suffix in zip(LANGUAGES, ICON_LANGUAGES):
            file = control / ('icon_' + suffix + '.dat')
            if lang in icons or not file.is_file() or not 0 < file.stat().st_size <= 4 * 1024 * 1024:
                continue
            with file.open('rb') as stream:
                header = stream.read(8)
            if header.startswith(b'\xff\xd8') or header.startswith(b'\x89PNG\r\n\x1a\n'):
                icons[lang] = str(file)
    default_name = name or names.get('en-us') or next(iter(names.values()), None)
    if default_name:
        names[None] = default_name
    if icons:
        icons[None] = icons.get('en-us') or next(iter(icons.values()))
    return dict(names=names, icons=icons, publisher=publisher, display_version=version)
