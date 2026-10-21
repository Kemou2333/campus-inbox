#!/usr/bin/env python3
"""Package only built public files, with an exact inventory for SSH deployment."""
import hashlib, io, json, pathlib, re, sys, tarfile

def package(directory, commit):
    if not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Expected the exact source commit')
    files = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError('Build contains a symlink')
        if path.is_file() and path.name != 'web-release.json':
            files[path.relative_to(directory).as_posix()] = path.read_bytes()
    manifest = {'commit': commit, 'files': {name: hashlib.sha256(data).hexdigest()
                                         for name, data in files.items()}}
    files['web-release.json'] = (json.dumps(manifest, sort_keys=True) + '\n').encode()
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(data), 0o644
            tar.addfile(member, io.BytesIO(data))
    return buffer.getvalue()

if __name__ == '__main__':
    sys.stdout.buffer.write(package(pathlib.Path(sys.argv[1]), sys.argv[2]))
