// Phase 12 - FK / reference-like column inventory (read-only) against lvs_audit.
'use strict';
const { q, pool, url } = require('./db.cjs');

(async () => {
  if (!/lvs_audit$/.test(url)) throw new Error('refusing: not lvs_audit');
  const tables = await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`);
  const fks = await q(`
    select tc.table_name, kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column,
           rc.delete_rule, rc.update_rule, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
    order by tc.table_name, kcu.column_name`);
  const uniques = await q(`
    select tc.table_name, tc.constraint_type, tc.constraint_name, string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as cols
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    where tc.constraint_type in ('UNIQUE','PRIMARY KEY') and tc.table_schema='public'
    group by 1,2,3 order by 1,3`);
  const idx = await q(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' and indexdef ilike '%unique%' order by 1,2`);
  const cols = await q(`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema='public' and (column_name ~ '_id$' or column_name in ('created_by','updated_by','deleted_by','entity_id','user_id'))
    order by 1,2`);
  const fkSet = new Set(fks.map(f => f.table_name + '.' + f.column_name));
  const refLike = cols.filter(c => c.data_type === 'integer').map(c => ({
    table: c.table_name, column: c.column_name, nullable: c.is_nullable, hasFk: fkSet.has(c.table_name + '.' + c.column_name),
  }));
  const counts = {};
  for (const t of tables) {
    const r = await q(`select count(*)::int as n from "${t.table_name}"`);
    counts[t.table_name] = r[0].n;
  }
  const out = { tables: tables.map(t => t.table_name), counts, fks, uniques, uniqueIndexes: idx, refLike };
  require('fs').writeFileSync(__dirname + '/p12-fk-inventory.json', JSON.stringify(out, null, 2));
  console.log('tables', tables.length, 'fks', fks.length, 'refLike', refLike.length, 'noFk', refLike.filter(r => !r.hasFk).length);
  console.log(JSON.stringify(counts));
  console.log('--- reference-like columns WITHOUT FK ---');
  for (const r of refLike.filter(r => !r.hasFk)) console.log(r.table + '.' + r.column + (r.nullable === 'NO' ? ' NOT NULL' : ''));
  console.log('--- FKs ---');
  for (const f of fks) console.log(`${f.table_name}.${f.column_name} -> ${f.ref_table}.${f.ref_column} ON DELETE ${f.delete_rule}`);
  console.log('--- unique indexes ---');
  for (const i of idx) console.log(i.indexdef);
  await pool.end();
})().catch(e => { console.error('ERR', e); process.exit(1); });
