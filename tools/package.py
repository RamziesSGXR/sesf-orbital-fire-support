#!/usr/bin/env python3
"""Builds the two release zips into release/ (needs Node for the bundle step, Python 3 standard library only).

  Orbital-Fury-PC.zip           one self-contained HTML file plus launchers for Windows, Mac and Linux
  orbital-fury-web.zip          the repository to push to GitHub and serve with GitHub Pages
"""
import pathlib, subprocess, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
subprocess.run(['node', 'tools/bundle.mjs'], cwd=root, check=True)
rel = root / 'release'
rel.mkdir(exist_ok=True)


def add(z, src, name, mode=0o644, crlf=False):
    data = pathlib.Path(src).read_bytes() if src else b''
    if crlf:
        data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    info = zipfile.ZipInfo(name, date_time=(2026, 10, 27, 0, 0, 0))
    info.external_attr = (0o100000 | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data)


# ---- PC ----
pc = rel / 'Orbital-Fury-PC.zip'
folder = 'Orbital-Fury'
with zipfile.ZipFile(pc, 'w') as z:
    add(z, root / 'dist' / 'orbital-fury.html', f'{folder}/Orbital-Fury.html')
    add(z, root / 'tools/pc/Play-Windows.bat', f'{folder}/Play-Windows.bat', crlf=True)
    add(z, root / 'tools/pc/Play-Mac.command', f'{folder}/Play-Mac.command', 0o755)
    add(z, root / 'tools/pc/Play-Linux.sh', f'{folder}/Play-Linux.sh', 0o755)
    add(z, root / 'tools/pc/README-PC.txt', f'{folder}/README-PC.txt', crlf=True)

# ---- Windows installer (0.62.26): needs NSIS (makensis); skipped with a note if it is not installed ----
import json, shutil, tempfile
ver = json.loads((root / 'package.json').read_text())['version']
exe = rel / 'Orbital-Fury-Setup.exe'
if shutil.which('makensis'):
    with tempfile.TemporaryDirectory() as td:
        t = pathlib.Path(td)
        shutil.copy(root / 'dist' / 'orbital-fury.html', t / 'Orbital-Fury.html')
        shutil.copy(root / 'tools/win/orbital-fury.ico', t / 'orbital-fury.ico')
        (t / 'README.txt').write_bytes((root / 'tools/win/README-WIN.txt').read_bytes().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n'))
        subprocess.run(['makensis', '-V2', f'-DVERSION={ver}', f'-DSRC={td}', f'-DOUT={exe}', str(root / 'tools/win/installer.nsi')], check=True)
else:
    print('makensis not found: no Windows installer (apt install nsis, or NSIS on Windows)')

# ---- Web (GitHub Pages) ----
web = rel / 'orbital-fury-web.zip'
skip_dirs = {'node_modules', 'dist', 'release', 'shots', '.git'}
with zipfile.ZipFile(web, 'w') as z:
    for p in sorted(root.rglob('*')):
        rp = p.relative_to(root)
        if p.is_dir() or any(part in skip_dirs for part in rp.parts):
            continue
        if rp.parts[0] == 'tools' and rp.parts[1:2] == ('pc',) and False:
            continue
        add(z, p, str(rp), 0o644)

for f in (pc, web) + ((exe,) if exe.exists() else ()):
    print(f'wrote {f.relative_to(root)} ({f.stat().st_size / 1024:.0f} KB)')
