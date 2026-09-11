#!/bin/bash
# Phase 17 (e): partial / corrupt / erroring archives through POST /api/backups/restore/database
# (loose files in BACKUP_PATH root = "uploaded" entries, no checksum) and the tampered manifest case.
set -u
export PATH="/c/Program Files/PostgreSQL/17/bin:/c/Program Files/Git/usr/bin:$PATH"; export PGPASSWORD=postgres
cd "/c/Users/kees lam/Desktop/LVStest-main/LVStest-main/docs/audit/wip/scripts"
B="/c/Users/kees lam/Desktop/LVStest-main/audit-backups"
F=files/p17
cp $F/p17-trunc50.sql.gz $F/p17-corrupt.sql.gz $F/p17-sqlerror.sql.gz $F/p17-copyerror.sql.gz $F/p17-half.sql "$B/"
cp $F/db-backup-p17-tamper.sql.gz $F/db-backup-p17-tamper.sql.gz.manifest.json "$B/database/2026/09/10/"
run_case () { # name filename
  echo "################ CASE $1 ($2)"
  node p17-mutate.cjs "$1" 2>&1 | grep -E "^(vehicle|delete vehicle 18|put setting)" | cut -c1-70
  bash p17-snap.sh | grep -E "^(tables|vehicles|audit_p17_marker)" | tr '\n' ';'; echo
  node p17-restore.cjs database "$2" 2>&1 | grep -E "status|success|error|session after" | cut -c1-700
  bash p17-snap.sh | tee $F/snap-e-$1.txt | grep -E "^(tables|vehicles|customers|reservations|users|session|audit_p17|smtp)" | tr '\n' ';'; echo
  psql -U postgres -h localhost lvs_audit_bk -At -c "select count(*) from pg_tables where schemaname='public'" | sed 's/^/tables now: /'
  ls "$B" | grep -v "^database$\|^files$" | tr '\n' ' '; echo
}
run_case trunc p17-trunc50.sql.gz
run_case corrupt p17-corrupt.sql.gz
run_case tamper db-backup-p17-tamper.sql.gz
run_case sqlerr p17-sqlerror.sql.gz
run_case copyerr p17-copyerror.sql.gz
echo "################ recover with the good backup"
node p17-restore.cjs database db-backup-2026-09-10T20-50-42-649Z.sql.gz 2>&1 | grep -E "status|success|error" | cut -c1-300
bash p17-snap.sh | grep -E "^(tables|vehicles|customers|reservations|users|session|audit_p17)" | tr '\n' ';'; echo
run_case half p17-half.sql
echo "################ recover with the good backup"
node p17-restore.cjs database db-backup-2026-09-10T20-50-42-649Z.sql.gz 2>&1 | grep -E "status|success|error" | cut -c1-300
bash p17-snap.sh | grep -E "^(tables|vehicles|customers|reservations|users|session|audit_p17)" | tr '\n' ';'; echo
echo "################ upload path: truncated + corrupt via restore-data"
node p17-restore.cjs restore-data $F/p17-trunc50.sql.gz p17-trunc50.sql.gz application/gzip 2>&1 | grep -E "status|error|success" | cut -c1-400
bash p17-snap.sh | grep -E "^(tables|vehicles)" | tr '\n' ';'; echo
node p17-restore.cjs restore-data $F/p17-corrupt.sql.gz p17-corrupt.sql.gz application/gzip 2>&1 | grep -E "status|error|success" | cut -c1-400
bash p17-snap.sh | grep -E "^(tables|vehicles)" | tr '\n' ';'; echo
node p17-restore.cjs restore-data $F/p17-copyerror.sql.gz p17-copyerror.sql.gz application/gzip 2>&1 | grep -E "status|error|success" | cut -c1-400
bash p17-snap.sh | grep -E "^(tables|vehicles|customers)" | tr '\n' ';'; echo
echo "################ recover with the good backup"
node p17-restore.cjs database db-backup-2026-09-10T20-50-42-649Z.sql.gz 2>&1 | grep -E "status|success|error" | cut -c1-300
bash p17-snap.sh | grep -E "^(tables|vehicles|customers|reservations|users|session|audit_p17)" | tr '\n' ';'; echo
psql -U postgres -h localhost lvs_audit_bk -c "select id,type,status,trigger,filename from backup_runs where id>=287 order by id"
ls -la "$B" "$B/database/2026/09/10" | grep -v manifest
