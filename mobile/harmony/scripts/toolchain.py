#!/usr/bin/env python3
"""Probe installed official tools; build only with --build. Never installs an SDK or signs."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def existing(candidates: list[Path], executable: bool = False) -> Path | None:
    return next((path.resolve() for path in candidates if path.exists() and (not executable or os.access(path, os.X_OK))), None)

def probe() -> dict:
    studio = existing([
        *([Path(os.environ['DEVECO_HOME'])] if os.environ.get('DEVECO_HOME') else []),
        Path('/Applications/DevEco-Studio.app/Contents'),
        Path('/Applications/DevEco Studio.app/Contents'),
        Path.home() / 'Applications/DevEco-Studio.app/Contents',
    ])
    hvigor = existing([
        *([Path(os.environ['HVIGORW_PATH'])] if os.environ.get('HVIGORW_PATH') else []),
        *([studio / 'tools/hvigor/bin/hvigorw'] if studio else []),
    ], True)
    ohpm = existing([
        *([Path(os.environ['OHPM_PATH'])] if os.environ.get('OHPM_PATH') else []),
        *([studio / 'tools/ohpm/bin/ohpm'] if studio else []),
    ], True)
    java = existing([
        *([Path(os.environ['JAVA_HOME']) / 'bin/java'] if os.environ.get('JAVA_HOME') else []),
        *([studio / 'jbr/Contents/Home/bin/java', studio / 'jbr/bin/java'] if studio else []),
    ], True)
    node = existing([
        *([studio / 'tools/node/bin/node', studio / 'tools/node/node'] if studio else []),
        *([Path(shutil.which('node'))] if shutil.which('node') else []),
    ], True)
    sdk = existing([
        *([Path(os.environ['HOS_SDK_HOME'])] if os.environ.get('HOS_SDK_HOME') else []),
        *([studio / 'sdk'] if studio else []),
        Path.home() / 'Library/Huawei/Sdk',
    ])
    tools = {'studio': studio, 'hvigor': hvigor, 'ohpm': ohpm, 'java': java, 'node': node, 'sdk': sdk}
    missing = [name for name in ['hvigor', 'ohpm', 'java', 'node', 'sdk'] if not tools[name]]
    return {'schemaVersion': 1, 'tools': {name: str(path) if path else None for name, path in tools.items()},
            'missing': missing, 'canAttemptBuild': not missing, 'buildVerified': False,
            'installableVerified': False, 'downloadUrl': None}

def verify_hap(path: Path) -> dict:
    if not path.is_file() or path.suffix != '.hap':
        raise RuntimeError('未找到真实的 HAP 编译产物。')
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if 'module.json' not in names or not any(name.endswith('.abc') for name in names):
            raise RuntimeError('产物不是含有 Ark 字节码的 Stage HAP。')
    return {'path': str(path), 'sizeBytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'kind': 'unsigned-hap', 'signatureVerified': False, 'installableVerified': False}

def main() -> int:
    parser = argparse.ArgumentParser(description='检查 DevEco 工具链，或显式构建 unsigned HAP。')
    parser.add_argument('--build', action='store_true', help='运行已安装的官方 Hvigor，不签名')
    parser.add_argument('--install-dependencies', action='store_true', help='允许 ohpm 安装工程依赖；与 --build 合用')
    parser.add_argument('--output', type=Path, help='将不含凭据的结果写入指定文件')
    args = parser.parse_args()
    result = probe()
    if args.build:
        if result['missing']:
            print('尚缺少官方工具：' + '、'.join(result['missing']), file=sys.stderr)
        else:
            paths = result['tools']
            environment = os.environ.copy()
            environment['JAVA_HOME'] = str(Path(paths['java']).parent.parent)
            environment['HOS_SDK_HOME'] = paths['sdk']
            environment['PATH'] = os.pathsep.join([str(Path(paths['node']).parent), str(Path(paths['java']).parent), environment.get('PATH', '')])
            if args.install_dependencies:
                subprocess.run([paths['ohpm'], 'install'], cwd=ROOT, env=environment, check=True)
            subprocess.run([paths['hvigor'], '--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default',
                            '-p', 'buildMode=release', 'assembleHap', '--no-daemon'], cwd=ROOT, env=environment, check=True)
            candidates = list((ROOT / 'entry/build').rglob('*unsigned.hap'))
            if len(candidates) != 1:
                raise RuntimeError('未能唯一确定 unsigned HAP，请检查 DevEco 构建结果。')
            result['artifact'] = verify_hap(candidates[0])
            result['buildVerified'] = True
    payload = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload)
    print(payload, end='')
    return 2 if args.build and not result['buildVerified'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
