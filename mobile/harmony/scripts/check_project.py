#!/usr/bin/env python3
"""Focused source/fixture checks. This is deliberately not an ArkTS compile claim."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT.parents[1]

def main() -> None:
    parsed = []
    for path in [*ROOT.rglob('*.json'), *ROOT.rglob('*.json5')]:
        if any(part in path.parts for part in ['build', 'oh_modules', '.hvigor']):
            continue
        # Config intentionally uses the JSON subset of JSON5 for an independent static check.
        json.loads(path.read_text())
        parsed.append(str(path.relative_to(ROOT)))
    module = json.loads((ROOT / 'entry/src/main/module.json5').read_text())['module']
    assert module['type'] == 'entry'
    assert module['requestPermissions'] == [{'name': 'ohos.permission.INTERNET'}]
    app = json.loads((ROOT / 'AppScope/app.json5').read_text())['app']
    assert app['bundleName'] == 'io.github.kemou2333.campusinbox'
    assert json.loads((ROOT / 'build-profile.json5').read_text())['app']['signingConfigs'] == []
    source_files = list((ROOT / 'entry/src/main/ets').rglob('*.ets'))
    assert source_files and not any('Web(' in path.read_text() or '@kit.ArkWeb' in path.read_text() for path in source_files)
    fixtures = json.loads((ROOT / 'entry/src/main/resources/rawfile/demo-notices.json').read_text())
    reviewed = [json.loads((WEB / 'src/features/onboarding/demo-notice.json').read_text()),
                *json.loads((WEB / 'src/features/onboarding/guest-demo-notices.json').read_text())]
    assert [entry['notice'] for entry in fixtures] == [entry['notice'] for entry in reviewed], '公开样例必须与已审查版本一致'
    status = json.loads((ROOT / 'availability.json').read_text())
    assert status['available'] is False and status['downloadUrl'] is None
    assert not list(ROOT.rglob('*.p12')) and not list(ROOT.rglob('*.p7b')) and not list(ROOT.rglob('*.cer'))
    result = {'staticChecksPassed': True, 'arktsCompilationVerified': False, 'jsonFiles': len(parsed),
              'arktsFiles': len(source_files), 'reviewedFixtures': len(fixtures),
              'fixtureSha256': hashlib.sha256((ROOT / 'entry/src/main/resources/rawfile/demo-notices.json').read_bytes()).hexdigest(),
              'signedInstallableArtifact': False}
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
