# Audit test harness facts (for test agents)

- Audit server: http://localhost:5001 (dev mode, tsx), database `lvs_audit` (clone of dev, 499 vehicles / 300 customers / 1806 reservations / 2 users), uploads in `C:\Users\kees lam\Desktop\LVStest-main\audit-uploads`. NEVER use port 5000 or database `lvstest`.
- DB access from node: `const url = process.env.DATABASE_URL.replace(/\/[a-z_]+$/i, '/lvs_audit')` after `require('dotenv').config()` in the repo root; `new (require('pg').Pool)({ connectionString: url, ssl: false })`.
- Staff login: `POST /api/login` JSON `{"username":"admin","password":"admin123"}` (rate limit 5 logins / 15 min per IP, lockout after 5 wrong passwords per account: log in ONCE, reuse the cookie jar; never send wrong passwords for `admin`, create a throwaway user for lockout tests).
- CSRF: after login the cookie `XSRF-TOKEN` is set; send its value as header `X-CSRF-Token` on every POST/PUT/PATCH/DELETE. Cookie-jar curl: `curl -s -c jar -b jar ...`; token: `grep XSRF-TOKEN jar | awk '{print $7}'`.
- Session cookie 15 min rolling.
- Portal realm: `POST /api/portal/login` `{"email":"portaal-test@example.com","password":"portaal-test-1234"}` (customer 179), `GET /api/portal/csrf-token` -> header `X-CSRF-Token`, cookie `portal.sid`.
- Prefix every record you create with `AUDIT-` (names, plates like `AU-001-X`, notes) so it is recognisable. Leave data in place; the database is disposable.
- Do not modify application code. Do not commit. Findings go to `docs/audit/wip/<area>.md`.
