#!/bin/bash
# Phase 17 (5) rerun: backup failure modes on :5002 (5a setting vs env, 5b unwritable dir, 5c missing dir).
set -u
export PATH="/c/Program Files/PostgreSQL/17/bin:/c/Program Files/Git/usr/bin:$PATH"; export PGPASSWORD=postgres
cd "/c/Users/kees lam/Desktop/LVStest-main/LVStest-main/docs/audit/wip/scripts"
B="/c/Users/kees lam/Desktop/LVStest-main/audit-backups"
BW='C:\Users\kees lam\Desktop\LVStest-main\audit-backups'
api () { node -e "
const { Session } = require('./p17-lib.cjs');
(async()=>{const s=new Session('x',{fakeIp:'10.17.1.$1'});const lg=await s.loginStaff('admin','admin123');if(lg.status!==200){console.log('LOGIN',lg.status,lg.text.slice(0,120));process.exit(0)}
$2
})();"
}
echo "################ (5a) backup-settings.localPath -> missing dir (BACKUP_PATH env should win)"
api 30 "const g=await s.get('/api/backup-settings');console.log('before',g.json.localPath);
const p=await s.put('/api/backup-settings/1',{localPath:'C:\\\\AUDIT-P17-does-not-exist\\\\backups'});console.log('PUT',p.status,(p.text||'').slice(0,160));
const h=await s.get('/api/backups/health');console.log('health',h.text);
const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,120));
const li=await s.get('/api/backups/list?type=database&limit=1');console.log('newest listed',li.json[0]&&li.json[0].filename);
const b=await s.put('/api/backup-settings/1',{localPath:'C:\\\\Users\\\\kees lam\\\\Desktop\\\\LVStest-main\\\\LVStest-main\\\\backups'});console.log('restored setting',b.status,b.json&&b.json.localPath);"
ls -d /c/AUDIT-P17-does-not-exist 2>&1 | head -1
ls -t "$B"/database/2026/09/10/*.sql.gz | head -1

echo "################ (5b) backup directory not writable (deny W on today's database dir via PowerShell icacls)"
powershell -NoProfile -Command "icacls '$BW\database\2026\09\10' /deny 'kees lam:(W)'" | head -1
powershell -NoProfile -Command "icacls '$BW\database\2026\09\10'" | grep -i deny
api 31 "const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,400));
const st=await s.get('/api/backups/status');console.log('status',st.text.slice(0,400));const h=await s.get('/api/backups/health');console.log('health',h.text.slice(0,400));"
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,status,trigger,filename,verified,left(error,150) err from backup_runs order by id desc limit 2"
powershell -NoProfile -Command "icacls '$BW\database\2026\09\10' /remove:d 'kees lam'" | head -1
powershell -NoProfile -Command "icacls '$BW\database\2026\09\10'" | grep -ic deny
echo "-- after ACL restored, next run should succeed and clear lastError:"
api 33 "const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms');const st=await s.get('/api/backups/status');console.log('status',st.text.slice(0,300));"

echo "################ (5c) BACKUP_PATH directory missing entirely (rename it)"
mv "$B" "$B.moved" && ls -d "$B" 2>&1 | head -1
api 32 "const h=await s.get('/api/backups/health');console.log('health',h.text.slice(0,300));const li=await s.get('/api/backups/list');console.log('list',li.status,Array.isArray(li.json)?li.json.length:li.text.slice(0,100));
const t=Date.now();const r=await s.post('/api/backups/run',{});console.log('run',r.status,Date.now()-t,'ms',(r.text||'').slice(0,160));
const li2=await s.get('/api/backups/list');console.log('list after run',li2.status,Array.isArray(li2.json)?li2.json.length:li2.text.slice(0,100));"
find "$B" -type f -printf "%s %p\n" 2>&1 | head -5
cp -r "$B.moved/." "$B/" && rm -rf "$B.moved" && echo "merged back; files now: $(find "$B" -type f | wc -l)"
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,status,trigger,filename,verified,left(error,80) err from backup_runs order by id desc limit 8"
