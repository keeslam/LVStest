#!/bin/bash
# Phase 17: snapshot of lvs_audit_bk state (counts, sequences, sessions, admin, smtp setting).
# usage: bash p17-snap.sh [dbname]
export PATH="/c/Program Files/PostgreSQL/17/bin:/c/Program Files/Git/usr/bin:$PATH"
export PGPASSWORD=postgres
DB=${1:-lvs_audit_bk}
psql -U postgres -h localhost "$DB" -At -F ' | ' <<'SQL'
select 'tables', count(*) from pg_tables where schemaname='public';
select 'vehicles', count(*), max(id), (select last_value from vehicles_id_seq) from vehicles;
select 'customers', count(*), max(id), (select last_value from customers_id_seq) from customers;
select 'reservations', count(*), max(id), (select last_value from reservations_id_seq) from reservations;
select 'users', count(*), (select count(*) from users where username='admin') as admin from users;
select 'portal_users', count(*), left(md5(string_agg(coalesce(password_hash,''), ',' order by id)),8) from portal_users;
select 'session', count(*) from session;
select 'backup_runs', count(*), max(id) from backup_runs;
select 'documents', count(*) from documents;
select 'audit_p17_vehicles', count(*) from vehicles where license_plate like 'AU-17%' or brand like 'AUDIT-P17%';
select 'audit_p17_customers', count(*) from customers where name like 'AUDIT-P17%';
select 'smtp_password', value->>'smtpPassword' from app_settings where key='email_config';
select 'audit_p17_marker', value::text from app_settings where key='audit_p17_marker';
select 'dbsize', pg_size_pretty(pg_database_size(current_database()));
SQL
