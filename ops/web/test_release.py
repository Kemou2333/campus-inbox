import importlib.util, io, json, pathlib, tarfile, tempfile, unittest

def load(name):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

installer, packer = load('install'), load('package')

class ReleaseBoundary(unittest.TestCase):
    def build(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = pathlib.Path(temp.name)
        (root / 'index.html').write_text('<script src="./assets/main-test.js"></script>')
        (root / 'runtime-config.json').write_text(json.dumps({
            'apiEndpoint': 'https://123.57.30.129/analyze',
            'syncEndpoint': 'https://123.57.30.129/sync'}))
        (root / 'android-download.json').write_text('{}')
        (root / 'assets').mkdir()
        (root / 'assets/main-test.js').write_text('void 0;')
        return root

    def test_inventory_and_exact_source(self):
        files, manifest = installer.read_release(packer.package(self.build(), 'a' * 40))
        self.assertEqual(manifest['commit'], 'a' * 40)
        self.assertEqual(len(files), 5)

    def test_rejects_private_unexpected_build_file(self):
        root = self.build()
        (root / '.env').write_text('not-a-real-secret')
        with self.assertRaises(ValueError):
            installer.read_release(packer.package(root, 'a' * 40))

    def test_rejects_archive_traversal_symlink_and_oversize(self):
        for name, kind, size in [('../escape.js', tarfile.REGTYPE, 0),
                                  ('assets/link.js', tarfile.SYMTYPE, 0),
                                  ('assets/large.js', tarfile.REGTYPE, 9 * 1024 * 1024)]:
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
                member = tarfile.TarInfo(name)
                member.type, member.size = kind, size
                tar.addfile(member, io.BytesIO(b'0' * size) if size else None)
            with self.subTest(name=name), self.assertRaises(ValueError):
                installer.read_release(buffer.getvalue())

    def test_rejects_tampered_inventory(self):
        root = self.build()
        archive = packer.package(root, 'a' * 40)
        buffer = io.BytesIO()
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source, tarfile.open(fileobj=buffer, mode='w:gz') as target:
            for member in source:
                data = source.extractfile(member).read()
                if member.name.endswith('.js'):
                    data = b'changed'
                    member.size = len(data)
                target.addfile(member, io.BytesIO(data))
        with self.assertRaises(ValueError):
            installer.read_release(buffer.getvalue())

if __name__ == '__main__':
    unittest.main()
