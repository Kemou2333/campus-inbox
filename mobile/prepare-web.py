#!/usr/bin/env python3
"""Bundle public web assets, without personal data or credentials, into the APK."""
import pathlib,shutil
project=pathlib.Path(__file__).resolve().parents[1]
web=project/'dist';destination=project/'mobile/android/app/src/main/assets/web'
if destination.exists():shutil.rmtree(destination)
shutil.copytree(web,destination,ignore=shutil.ignore_patterns('*.apk','downloads'))
for name in ['native.js','native-theme.js','native-theme.css']:
 source=project/'mobile/web'/name
 if not source.exists():raise SystemExit('Missing native web asset: '+name)
 shutil.copy2(source,destination/name)
p=destination/'index.html';text=p.read_text().replace('<html lang="zh-CN">','<html lang="zh-CN" data-native="android">')
# Native theme overrides all shared web styles. Bridge waits for existing app modules.
text=text.replace('</head>','<link rel="stylesheet" href="native-theme.css"><script defer src="native-theme.js"></script><script defer src="native.js"></script></head>')
p.write_text(text)
print('APK web assets prepared from current public source.')
