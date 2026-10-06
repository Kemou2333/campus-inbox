"""Exercise the restricted installer in a temporary fake host, never /opt."""
import contextlib
import io
import pathlib
import runpy
import subprocess
import sys
import tarfile
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

Path = type(pathlib.Path())
INSTALLER = Path(__file__).resolve().parents[1] / 'install-release.py'
FILES = {
    'server/index.mjs', 'server/analyze.mjs', 'server/service.mjs',
    'server/sync.mjs', 'server/auth.mjs', 'server/manage-invites.mjs',
    'worker/prompt.mjs', 'server/contracts/data.js', 'server/contracts/time.js',
}


def archive(extra=None):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w:gz') as tar:
        for name in sorted(FILES | ({extra} if extra else set())):
            content = b'export {};\n'
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    return stream.getvalue()


class InstallerTests(unittest.TestCase):
    def exercise(self, mode='success', extra=None):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory).resolve()
            root = fake / 'opt/campus-inbox'
            old = root / 'releases/previous'
            old.mkdir(parents=True)
            current = root / 'current'
            current.symlink_to(old)
            calls = []

            def host_path(value, *parts):
                value = str(value)
                if value == '/opt' or value.startswith('/opt/'):
                    value = str(fake) + value
                return Path(value, *parts)

            def command(args, **kwargs):
                if args[0] == '/usr/bin/systemctl':
                    calls.append(current.resolve())
                    if mode == 'restart-failure' and len(calls) == 1:
                        raise subprocess.CalledProcessError(1, args)
                else:
                    self.assertEqual(args[0], '/opt/campus-inbox/runtime/node')
                    self.assertEqual(args[1], '--check')
                    self.assertTrue(Path(args[2]).is_file())
                return subprocess.CompletedProcess(args, 0)

            class Healthy:
                status = 200
                def __enter__(self): return self
                def __exit__(self, *args): return False

            def health(*args, **kwargs):
                if mode == 'health-failure':
                    raise urllib.error.URLError('fake unavailable host')
                return Healthy()

            output = io.StringIO()
            with patch('pathlib.Path', host_path), patch('subprocess.run', command), patch('urllib.request.urlopen', health), patch('time.sleep', lambda _: None), patch.object(sys, 'stdin', type('Input', (), {'buffer': io.BytesIO(archive(extra))})()), contextlib.redirect_stdout(output):
                with self.assertRaises(SystemExit) as result:
                    runpy.run_path(str(INSTALLER), run_name='__main__')
            if mode == 'success' and not extra:
                self.assertEqual(result.exception.code, 0)
                self.assertNotEqual(current.resolve(), old)
                self.assertEqual(set(str(path.relative_to(current.resolve())) for path in current.resolve().rglob('*') if path.is_file()), FILES)
                self.assertEqual(len(calls), 1)
                self.assertIn('release deployed', output.getvalue())
            elif extra:
                self.assertEqual(current.resolve(), old)
                self.assertEqual(calls, [])
                self.assertEqual(list((root / 'releases').iterdir()), [old])
            else:
                self.assertEqual(current.resolve(), old)
                self.assertEqual(len(calls), 2)
                self.assertNotEqual(calls[0], old)
                self.assertEqual(calls[1], old)
                self.assertIn('previous release restored', str(result.exception.code))

    def test_exact_release_is_installed(self): self.exercise()
    def test_restart_failure_restores_previous_release(self): self.exercise('restart-failure')
    def test_failed_health_restores_previous_release(self): self.exercise('health-failure')
    def test_extra_file_is_rejected_before_mutation(self): self.exercise(extra='../../private.env')


if __name__ == '__main__': unittest.main()
