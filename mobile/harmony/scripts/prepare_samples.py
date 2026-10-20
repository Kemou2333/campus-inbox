#!/usr/bin/env python3
"""Copy the latest already-reviewed demo fixtures; never create provider provenance."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT.parents[1]
reviewed = [json.loads((WEB / 'src/features/onboarding/demo-notice.json').read_text()),
            *json.loads((WEB / 'src/features/onboarding/guest-demo-notices.json').read_text())]
if len(reviewed) != 3 or any(not value.get('provenance', {}).get('manualIdentityReview') for value in reviewed):
    raise SystemExit('请先完成三条公开示例的现有人工隐私审查。')
target = ROOT / 'entry/src/main/resources/rawfile/demo-notices.json'
target.write_text(json.dumps([{'notice': value['notice']} for value in reviewed], ensure_ascii=False, indent=2) + '\n')
print('已复用 3 条已审查示例；没有创建模型调用或改写模型响应来源。')
