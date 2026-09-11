#!/bin/bash
# Phase 17 (8): GFS retention via POST /api/backups/cleanup with synthetic old backups (manifest timestamps).
set -u
export PATH="/c/Program Files/PostgreSQL/17/bin:/c/Program Files/Git/usr/bin:$PATH"; export PGPASSWORD=postgres
cd "/c/Users/kees lam/Desktop/LVStest-main/LVStest-main/docs/audit/wip/scripts"
B="/c/Users/kees lam/Desktop/LVStest-main/audit-backups"
SRC="$B/database/2026/09/10/db-backup-2026-09-10T20-50-42-649Z.sql.gz"
mk () { # type yyyy mm dd label
  local type=$1 y=$2 m=$3 d=$4; local dir="$B/$type/$y/$m/$d"; mkdir -p "$dir"
  local ext; [ $type = database ] && ext=sql.gz || ext=tar.gz
  local pfx; [ $type = database ] && pfx=db-backup || pfx=files-backup
  local fn="$pfx-$y-$m-${d}T02-00-00-000Z.$ext"
  head -c 2048 "$SRC" > "$dir/$fn"
  local sum=$(sha256sum "$dir/$fn" | cut -d' ' -f1)
  printf '{"timestamp":"%s-%s-%sT02:00:00.000Z","type":"%s","filename":"%s","size":2048,"checksum":"%s"}\n' $y $m $d $type "$fn" "$sum" > "$dir/$fn.manifest.json"
  psql -U postgres -h localhost lvs_audit_bk -q -c "insert into backup_runs(started_at,finished_at,type,status,filename,size_bytes,checksum,verified,trigger) values ('$y-$m-$d 02:00','$y-$m-$d 02:00:05','$type','success','$fn',2048,'$sum',true,'scheduled')"
  echo "created $fn ($5)"
}
mk database 2026 08 20 "21d old, Thursday -> expect DELETE (daily window 14d)"
mk database 2026 08 23 "18d old, Sunday -> expect KEEP (weekly)"
mk database 2026 06 01 "101d old, 1st of month -> expect KEEP (monthly)"
mk database 2026 06 15 "87d old, not 1st -> expect DELETE"
mk database 2025 05 01 "497d old, 1st -> expect DELETE (>365d)"
mk files    2026 08 20 "21d old files backup -> expect DELETE"
mk files    2026 06 01 "101d old files, 1st -> expect KEEP"
# an "uploaded" loose file with an old mtime in the root: must never be pruned
head -c 2048 "$SRC" > "$B/uploaded-old.sql.gz"; touch -d "2024-01-01 00:00" "$B/uploaded-old.sql.gz"
echo "--- list before (old ones):"
node -e "
const { Session } = require('./p17-lib.cjs');
(async()=>{const s=new Session('x',{fakeIp:'10.17.1.60'});await s.loginStaff('admin','admin123');
const l=await s.get('/api/backups/list');console.log('total listed', l.json.length);console.log(l.json.filter(b=>b.timestamp<'2026-09').map(b=>b.type+' '+b.filename+' '+b.timestamp+' '+b.checksum.slice(0,8)).join('\n'));
const t=Date.now();const c=await s.post('/api/backups/cleanup',{});console.log('POST /api/backups/cleanup',c.status,Date.now()-t,'ms',c.text.slice(0,120));
const l2=await s.get('/api/backups/list');console.log('total listed after', l2.json.length);console.log(l2.json.filter(b=>b.timestamp<'2026-09').map(b=>b.type+' '+b.filename+' '+b.timestamp+' '+b.checksum.slice(0,8)).join('\n'));
})();"
echo "--- on disk after cleanup:"
find "$B/database/2026/08" "$B/database/2026/06" "$B/database/2025" "$B/files/2026/08" "$B/files/2026/06" -type f 2>/dev/null
ls -la "$B/uploaded-old.sql.gz"
echo "--- backup_runs filePruned:"
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,filename,file_pruned from backup_runs where filename like '%T02-00-00-000Z%' order by filename"
echo "--- empty dirs left behind?"; find "$B" -type d -empty | head
echo "--- sequence-reset state check: is vehicle id 1 taken (what an insert would collide with after case (6))?"
psql -U postgres -h localhost lvs_audit_bk -At -c "select min(id) from vehicles" | sed 's/^/min vehicle id: /'
