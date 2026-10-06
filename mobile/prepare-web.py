#!/usr/bin/env python3
"""Package one shared web build in Android; never copy personal data or credentials."""
from pathlib import Path
import shutil

project = Path(__file__).resolve().parents[1]
source = project / "dist"
destination = project / "mobile/android/app/src/main/assets/web"
index = source / "index.html"
if not index.is_file():
    raise SystemExit("Web build missing. Run npm run build first.")
text = index.read_text()
if 'src="/assets/' in text or 'href="/assets/' in text:
    raise SystemExit("Android needs relative assets. Use Vite base='./' for this build.")
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(source, destination, ignore=shutil.ignore_patterns("*.apk", "downloads", "*.map"))
print("Shared web build packaged for Android.")
