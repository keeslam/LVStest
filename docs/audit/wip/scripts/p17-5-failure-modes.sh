#!/bin/bash
# Phase 17 (6)+(5): empty-database restore, then backup failure modes on :5002.
set -u
export PATH="/c/Program Files/PostgreSQL/17/bin:/c/Program Files/Git/usr/bin:$PATH"; export PGPASSWORD=postgres
cd "/c/Users/kees lam/Desktop/LVStest-main/LVStest-main/docs/audit/wip/scripts"
B="/c/Users/kees lam/Desktop/LVStest-main/audit-backups"
BW='C:\Users\kees lam\Desktop\LVStest-main\audit-backups'
F=files/p17
api () { node -e "
const { Session } = require('./p17-lib.cjs');
(async()=>{const s=new Session('x',{fakeIp:'10.17.1.$1'});const l=await s.loginStaff('admin','admin123');if(l.status!==200){console.log('LOGIN',l.status,l.text.slice(0,120));process.exit(0)}
$2
})();"
}
echo "################ (6) EMPTY DATABASE RESTORE"
cp $F/p17-empty.sql.gz "$B/"
node p17-restore.cjs database p17-empty.sql.gz 2>&1 | grep -E "status|success|error|session after" | cut -c1-400
bash p17-snap.sh | tee $F/snap-6-empty.txt | grep -E "^(tables|vehicles|customers|users|session|smtp|backup_runs)" | tr '\n' ';'; echo
echo "-- app behaviour with empty DB (one login attempt only):"
curl -s -o /dev/null -w "GET /api/health %{http_code}\n" http://localhost:5002/api/health
curl -s -w " -> POST /api/login %{http_code}\n" -H "Content-Type: application/json" -H "X-Forwarded-For: 10.17.1.90" -d '{"username":"admin","password":"admin123"}' http://localhost:5002/api/login | cut -c1-200
curl -s -o /dev/null -w "GET /api/backups/health (no auth) %{http_code}\n" http://localhost:5002/api/backups/health
curl -s -o /dev/null -w "GET / %{http_code}\n" http://localhost:5002/
psql -U postgres -h localhost lvs_audit_bk -At -c "select count(*) from users" | sed 's/^/users: /'
echo "-- recover: in-app impossible (no users) -> psql from the pre-restore safety backup"
SAFE=$(ls -t "$B"/database/2026/09/10/db-backup-*.sql.gz | head -1); echo "safety file: $SAFE"
gunzip -c "$SAFE" | psql -U postgres -h localhost -q -v ON_ERROR_STOP=1 lvs_audit_bk >/dev/null 2>&1; echo "psql exit=$?"
bash p17-snap.sh | grep -E "^(tables|vehicles|users|session)" | tr '\n' ';'; echo
node p17-restore.cjs database db-backup-2026-09-10T20-50-42-649Z.sql.gz 2>&1 | grep -E "status|success|error" | cut -c1-200
bash p17-snap.sh | grep -E "^(tables|vehicles|customers|reservations|users|session|audit_p17)" | tr '\n' ';'; echo

echo "################ (5a) backup-settings.localPath -> missing dir (BACKUP_PATH env should win)"
api 30 "const g=await s.get('/api/backup-settings');console.log('before',g.json.localPath);
const p=await s.put('/api/backup-settings/1',{localPath:'C:\\\\AUDIT-P17-does-not-exist\\\\backups'});console.log('PUT',p.status,(p.text||'').slice(0,160));
const h=await s.get('/api/backups/health');console.log('health',h.text);
const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,200));
const l=await s.get('/api/backups/list?type=database&limit=1');console.log('newest listed',l.json[0]&&l.json[0].filename);
const b=await s.put('/api/backup-settings/1',{localPath:'C:\\\\Users\\\\kees lam\\\\Desktop\\\\LVStest-main\\\\LVStest-main\\\\backups'});console.log('restored setting',b.status,b.json&&b.json.localPath);"
ls -d /c/AUDIT-P17-does-not-exist 2>&1 | head -1
ls -t "$B"/database/2026/09/10/*.sql.gz | head -1

echo "################ (5b) backup directory not writable (icacls deny W on today's database dir)"
icacls "$BW\database\2026\09\10" /deny "kees lam:(W)" | head -2
api 31 "const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,400));
const st=await s.get('/api/backups/status');console.log('status',st.text.slice(0,400));const h=await s.get('/api/backups/health');console.log('health',h.text.slice(0,400));"
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,status,trigger,filename,verified,left(error,120) err from backup_runs order by id desc limit 2"
icacls "$BW\database\2026\09\10" /remove:d "kees lam" | head -1
ls -la "$B/database/2026/09/10" | tail -2
ls -la /c/Users/KEESLA~1/AppData/Local/Temp/db-backup-* 2>/dev/null | tail -3

echo "################ (5c) BACKUP_PATH directory missing entirely (rename it)"
mv "$B" "$B.moved" && ls -d "$B" 2>&1 | head -1
api 32 "const h=await s.get('/api/backups/health');console.log('health',h.text.slice(0,300));const l=await s.get('/api/backups/list');console.log('list',l.status,Array.isArray(l.json)?l.json.length:l.text.slice(0,100));
const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,160));"
find "$B" -type f -printf "%s %p\n" 2>&1 | head -5
# merge back
cp -r "$B.moved/." "$B/" && rm -rf "$B.moved" && echo "merged back; files now: $(find "$B" -type f | wc -l)"
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,status,trigger,filename,verified,left(error,80) err from backup_runs order by id desc limit 6"
