# Phase 36 regression verification — shared briefing

**Server:** http://127.0.0.1:5003 (branch `fix/audit-remediation`, DB `lvs_regress`).
Login `admin` / `admin123`. Portal login `portaal-test@example.com` / `P36portal!23` (customer 179).
UPLOADS_DIR = `C:\Users\kees lam\Desktop\LVStest-main\regress-uploads`
BACKUP_PATH = `C:\Users\kees lam\Desktop\LVStest-main\regress-backups`

**NEVER** touch ports 5000/5001/5002 or databases `lvstest`, `lvs_audit`, `lvs_audit_bk`, `lvs_fixtest`.

Postgres: `export PATH="/c/Program Files/PostgreSQL/17/bin:$PATH"; export PGPASSWORD=postgres; psql -U postgres -h localhost lvs_regress`

**Harness:** `docs/audit/wip/scripts/p36/lib.cjs` exports `{ Session }` — `new Session(name)`,
`await s.loginStaff('admin','admin123')`, `await s.loginPortal(email,pw)`, then
`s.get/post/patch/put/del(path, body)` returning `{status, text, json, headers}`.
CSRF and cookies are handled automatically.

**Bug index:** `docs/audit/wip/scripts/p36/bugindex.json` — per BUG-id the fields
`Reproduction`, `Regression test`, `Expected`, `Actual`, `Root cause`, `Affected files`.
**Triage:** `docs/audit/wip/scripts/p36/triage.tsv` — id / severity / bucket / cluster.
**Claimed fixes:** `docs/audit/wip/scripts/p36/claimed.json` — id -> commits that name it.

## Rules
1. **Do NOT change application code.** Scripts and output files under
   `docs/audit/wip/scripts/p36/` only. If something is broken, record it; do not repair it.
2. Fixtures get an `AUDIT-P36` prefix (plus your own agent letter, e.g. `AUDIT-P36B`).
3. Verdicts — use exactly one per bug:
   - `FIXED` — the documented reproduction now gives the documented expected result.
   - `NOT FIXED` — the reproduction still gives the old broken result.
   - `CHANGED BY DECISION` — behaviour deliberately differs, name the B-id from `docs/audit/besluiten.md`.
   - `NOT APPLICABLE` — dev-only, refuted, or deferred by the plan.
   - `NIET VASTGESTELD` — could not be reproduced either way (no fixture, no tool, ambiguous).
     Never call this FIXED.
4. Every verdict needs one line of **evidence**: status code, SQL row, file path, or log line.
   Code-only verification (reading the diff) is allowed where runtime repro is impossible —
   then say `code-inspectie` in the evidence and name file:line.
5. Output: append JSONL rows to your own file, one per bug:
   `{"id":"BUG-xxx","verdict":"FIXED","evidence":"...","method":"runtime|code-inspectie|sql"}`
