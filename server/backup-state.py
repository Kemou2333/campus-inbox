"""Private online SQLite snapshots. Never delete user records or old backups."""
import datetime,gzip,json,os,pathlib,shutil,sqlite3,tempfile
from contextlib import closing
os.umask(0o077)
STATE=pathlib.Path(os.environ.get('CAMPUS_STATE_DIRECTORY','/var/lib/campus-inbox'))
BACKUPS=STATE/'backups';BACKUPS.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(BACKUPS,0o700)
now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%S%fZ');statusfile=BACKUPS/'status.json'
previous={}
try:previous=json.loads(statusfile.read_text())
except (OSError,ValueError):pass
status={'status':'running','lastAttemptAt':now.isoformat(),'lastSuccessAt':previous.get('lastSuccessAt'),'sizeBytes':0,'errorCode':None}
def save():
 p=BACKUPS/'.status.tmp';p.write_text(json.dumps(status,indent=2)+'\n');os.chmod(p,0o600);p.replace(statusfile)
save();partial=None
try:
 limit=int(os.environ.get('CAMPUS_BACKUP_MAX_BYTES','536870912'))
 used=sum(p.stat().st_size for p in BACKUPS.rglob('*') if p.is_file())
 if used>=limit:raise RuntimeError('BACKUP_CAPACITY')
 partial=pathlib.Path(tempfile.mkdtemp(prefix='.partial-',dir=BACKUPS));os.chmod(partial,0o700)
 sources=[]
 for name in ['auth.sqlite','sync.sqlite']:
  origin=STATE/name
  if not origin.is_file():raise RuntimeError('BACKUP_SOURCE_MISSING')
  temporary=partial/name
  with closing(sqlite3.connect('file:'+str(origin)+'?mode=ro',uri=True)) as source,closing(sqlite3.connect(temporary)) as destination:
   source.backup(destination,pages=100,sleep=0.02)
   if destination.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise RuntimeError('BACKUP_INTEGRITY')
  os.chmod(temporary,0o600)
  packed=partial/(name+'.gz')
  with temporary.open('rb') as source,gzip.open(packed,'wb',compresslevel=6) as destination:shutil.copyfileobj(source,destination)
  os.chmod(packed,0o600);temporary.unlink();sources.append(name)
 usage=STATE/'usage.json'
 if usage.exists():
  # Atomic producer replacement makes the read a coherent original file.
  data=usage.read_bytes();json.loads(data)
  p=partial/'usage.json.gz'
  with gzip.open(p,'wb',compresslevel=6) as destination:destination.write(data)
  os.chmod(p,0o600)
 size=sum(p.stat().st_size for p in partial.iterdir())
 manifest=partial/'manifest.json';manifest.write_text(json.dumps({'createdAt':now.isoformat(),'sqliteOnlineBackup':True,'databases':sources,'crossDatabaseAtomic':False,'bytes':size},indent=2)+'\n');os.chmod(manifest,0o600)
 size=sum(p.stat().st_size for p in partial.iterdir())
 if size+used+4096>limit:raise RuntimeError('BACKUP_CAPACITY')
 partial.rename(BACKUPS/stamp);partial=None
 status.update(status='ok',lastSuccessAt=now.isoformat(),sizeBytes=size,errorCode=None)
except Exception as issue:
 code=str(issue) if str(issue) in {'BACKUP_CAPACITY','BACKUP_SOURCE_MISSING','BACKUP_INTEGRITY'} else 'BACKUP_FAILED'
 status.update(status='error',errorCode=code)
finally:
 if partial is not None:shutil.rmtree(partial) # Only this invocation's uncommitted temporary files.
 save()
print(json.dumps({k:status[k] for k in ['status','lastSuccessAt','sizeBytes','errorCode']}))
if status['status']!='ok':raise SystemExit(1)
