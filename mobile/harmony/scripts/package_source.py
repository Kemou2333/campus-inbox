#!/usr/bin/env python3
"""Package only the unsigned, public native source tree; never builds or signs an app."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT.parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
args = parser.parse_args()
subprocess.run([sys.executable, str(ROOT / 'scripts/check_project.py')], check=True)
excluded_dirs = {'oh_modules', '.hvigor', '.idea', 'build', '__pycache__'}
root_files = {'.gitignore', 'README.md', 'availability.json', 'oh-package.json5', 'build-profile.json5', 'hvigorfile.ts'}
directory_suffixes = {'AppScope': {'.json', '.json5', '.svg'}, 'entry': {'.json', '.json5', '.ets', '.ts', '.svg'},
                      'hvigor': {'.json5'}, 'scripts': {'.py'}, 'checks': {'.mjs'}}
def public_source(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if len(relative.parts) == 1:
        return path.name in root_files
    return path.suffix in directory_suffixes.get(relative.parts[0], set())
files = [path for path in ROOT.rglob('*') if path.is_file()
         and not any(part in excluded_dirs for part in path.relative_to(ROOT).parts)
         and public_source(path)
         and path.name not in {'local-signing.json5', 'build-evidence.json'}]
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, 'campus-inbox-harmony/' + str(path.relative_to(ROOT)))
    archive.write(WEB / 'LICENSE', 'campus-inbox-harmony/LICENSE')
print(json.dumps({'kind': 'native-source-archive', 'path': str(args.output.resolve()), 'files': len(files) + 1,
                  'sizeBytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
                  'containsInstallablePackage': False}, ensure_ascii=False, indent=2))
