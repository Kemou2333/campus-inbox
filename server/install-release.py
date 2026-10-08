#!/usr/bin/python3
"""Install only this application's source; called by a restricted deploy key."""
import io,os,pathlib,subprocess,sys,tarfile,time,urllib.request,uuid
allowed={'server/index.mjs','server/analyze.mjs','server/service.mjs','server/image-captcha.mjs','server/sync.mjs','server/auth.mjs','server/email-auth.mjs','server/mail-sender.mjs','server/manage-invites.mjs','worker/prompt.mjs','server/contracts/data.js','server/contracts/time.js','server/contracts/email-policy.mjs','server/vendor/nodemailer-10.0.16.mjs','server/vendor/NODEMAILER-LICENSE','server/vendor/NODEMAILER-SOURCE.md'}
archive=sys.stdin.buffer.read(4*1024*1024+1)
if len(archive)>4*1024*1024:raise SystemExit('Release archive is too large')
files={}
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tar:
 for member in tar:
  if not member.isfile() or member.name not in allowed or member.name in files or member.size>300000:raise SystemExit('Unexpected release content')
  files[member.name]=tar.extractfile(member).read()
if set(files)!=allowed:raise SystemExit('Release is missing required source')
if sum(map(len,files.values()))>3*1024*1024:raise SystemExit('Release source exceeds limit')
release=pathlib.Path('/opt/campus-inbox/releases')/(time.strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8])
release.mkdir(mode=0o755)
for name,data in files.items():
 path=release/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);path.chmod(0o644)
 if path.suffix in {'.mjs','.js','.cjs'}:
  for_check=subprocess.run(['/opt/campus-inbox/runtime/node','--check',str(path)],capture_output=True)
  if for_check.returncode:raise SystemExit('Release source has a syntax error')
current=pathlib.Path('/opt/campus-inbox/current');previous=current.resolve();pending=current.with_name('current-next')
pending.symlink_to(release);os.replace(pending,current)
try:
 subprocess.run(['/usr/bin/systemctl','restart','campus-inbox'],check=True)
 for _ in range(10):
  try:
   with urllib.request.urlopen('http://127.0.0.1:8787/health',timeout=2) as response:
    if response.status==200:print('Campus Inbox release deployed');sys.exit(0)
  except Exception:time.sleep(1)
except subprocess.CalledProcessError:
 pass
pending.symlink_to(previous);os.replace(pending,current);subprocess.run(['/usr/bin/systemctl','restart','campus-inbox'],check=True)
raise SystemExit('Service restart or health check failed; previous release restored')
