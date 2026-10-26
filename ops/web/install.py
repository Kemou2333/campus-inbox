#!/usr/bin/python3
"""Install a bounded static build without changing the backend or user state."""
import hashlib, io, json, os, pathlib, re, sys, tarfile, time, urllib.request, uuid

SITE = pathlib.Path('/var/www/campus-inbox-site')
MAX_ARCHIVE = 12 * 1024 * 1024
MAX_CONTENT = 24 * 1024 * 1024
TOP = {'index.html', 'admin-preview.html', 'icon.svg', 'runtime-config.json',
       'android-download.json', 'examples.json', 'examples-legacy.json',
       'examples-legacy-2.4.json', 'examples-provenance.json', 'model-tests.json'}
SUFFIXES = {'.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg',
            '.webp', '.woff2', '.ttf', '.pfb', '.bcmap', '.wasm', '.mp3', '.wav', '.ogg', '.mp4'}

def read_release(archive):
    if len(archive) > MAX_ARCHIVE:
        raise ValueError('Archive exceeds limit')
    files, total = {}, 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        for member in tar:
            name = member.name
            path = pathlib.PurePosixPath(name)
            if (not member.isfile() or len(files) >= 300 or name in files
                or not re.fullmatch(r'[A-Za-z0-9_./-]+', name)
                or any(part.startswith('.') for part in name.split('/'))
                or path.is_absolute() or str(path) != name
                or member.size > 8 * 1024 * 1024
                or (name != 'web-release.json' and name not in TOP and
                    not (path.parts[0] in {'assets', 'onboarding'} and path.suffix in SUFFIXES))):
                raise ValueError('Unexpected static release member')
            total += member.size
            if total > MAX_CONTENT:
                raise ValueError('Expanded build exceeds limit')
            files[name] = tar.extractfile(member).read()
    manifest = json.loads(files.pop('web-release.json'))
    if not re.fullmatch(r'[a-f0-9]{40}', manifest.get('commit', '')):
        raise ValueError('Missing source revision')
    if set(manifest.get('files', {})) != set(files):
        raise ValueError('Build inventory differs')
    for name, data in files.items():
        if hashlib.sha256(data).hexdigest() != manifest['files'][name]:
            raise ValueError('Build digest differs')
    if not {'index.html', 'runtime-config.json', 'android-download.json'}.issubset(files):
        raise ValueError('Incomplete application')
    runtime = json.loads(files['runtime-config.json'])
    if runtime != {'apiEndpoint': 'https://123.57.30.129/analyze',
                   'syncEndpoint': 'https://123.57.30.129/sync'}:
        raise ValueError('Unexpected service origin')
    html = files['index.html'].decode()
    for asset in re.findall(r'(?:src|href)="\./(assets/[^"?#]+)', html):
        if asset not in files:
            raise ValueError('Missing entry asset')
    files['web-release.json'] = (json.dumps(manifest, sort_keys=True) + '\n').encode()
    return files, manifest

def switch_link(link, target):
    pending = link.with_name(link.name + '.pending-' + uuid.uuid4().hex)
    pending.symlink_to(target)
    os.replace(pending, link)

def install(archive):
    import fcntl
    files, manifest = read_release(archive)
    SITE.mkdir(parents=True, exist_ok=True, mode=0o755)
    with (SITE / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = SITE / 'current'
        if current.exists() and not current.is_symlink():
            raise ValueError('Refuse to replace an unmanaged directory')
        previous = current.resolve() if current.is_symlink() else None
        release = SITE / 'releases' / (manifest['commit'][:12] + '-' + uuid.uuid4().hex[:8])
        release.mkdir(parents=True, mode=0o755)
        for name, data in files.items():
            path = release / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            path.write_bytes(data)
            path.chmod(0o644)
            # Keep old hashed chunks available to tabs opened before an update.
            if name.startswith('assets/'):
                shared = SITE / 'shared' / name
                shared.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                if shared.exists() and shared.read_bytes() != data:
                    raise ValueError('Refuse to overwrite a different shared asset')
                if not shared.exists():
                    temporary = shared.with_name(shared.name + '.pending-' + uuid.uuid4().hex)
                    temporary.write_bytes(data)
                    temporary.chmod(0o644)
                    os.replace(temporary, shared)
        switch_link(current, release)
        try:
            request = urllib.request.Request('https://123.57.30.129/web-release.json?t=' + uuid.uuid4().hex,
                                             headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=12) as response:
                if json.load(response) != manifest:
                    raise ValueError('Published build differs')
            with urllib.request.urlopen('https://123.57.30.129/health', timeout=8) as response:
                if response.status != 200:
                    raise ValueError('Backend health failed')
        except Exception:
            if previous is not None:
                switch_link(current, previous)
            else:
                current.unlink()
            raise RuntimeError('Web verification failed; previous site restored') from None
        print(json.dumps({'deployed': True, 'commit': manifest['commit'],
                          'files': len(files), 'url': 'https://123.57.30.129/'}))

if __name__ == '__main__':
    install(sys.stdin.buffer.read(MAX_ARCHIVE + 1))
