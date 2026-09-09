# Realtime (Socket.IO) — controller check 2026-09-09

Script: `docs/audit/wip/scripts/socket-noauth.mjs` (node, socket.io-client), audit server :5001.

BUG RT-001
Severity: HIGH (CRITICAL zodra klant-/kostenrecords worden uitgezonden; hier bewezen met een voertuigrecord)
Feature: Realtime updates (Socket.IO)
Status: OPEN
Reproduction: `node docs/audit/wip/scripts/socket-noauth.mjs` — verbindt ZONDER cookie met `http://localhost:5001`, daarna maakt een ingelogde admin een voertuig aan via `POST /api/vehicles`.
Expected: anonieme socket wordt geweigerd bij handshake, of ontvangt hooguit een "refresh"-signaal zonder data.
Actual: `connected without cookie: true`; de anonieme socket ontvangt `data-update {"entityType":"vehicles","action":"created","data":{...volledig voertuigrecord incl. id, kenteken, chassisnummer, km, ...}}`. Dezelfde `broadcastDataUpdate` wordt gebruikt voor customers, reservations, expenses, documents, users (zonder wachtwoord) en portaalmeldingen.
Root cause: `server/index.ts:196-237` geen auth op `io.on('connection')`; `server/realtime-events.ts:11-23` `io.emit` naar alle sockets met het volledige record als payload; CORS `*` in development.
Affected files: server/index.ts, server/realtime-events.ts, client/src/hooks/use-socket.tsx
Affected data: alle entiteiten die via `broadcastDataUpdate` gaan
Security impact: onbevoegde uitlezing van klant-, contract-, kosten- en gebruikersgegevens door iedereen die de socket-URL bereikt (in productie achter Coolify bereikbaar op dezelfde host als de app).
Business impact: AVG-datalek; concurrent kan vloot- en klantmutaties live volgen.
Fix (proposal only): Socket.IO-middleware die de express-session uit de handshake-cookie valideert (session store lookup) en anders `next(new Error('unauthorized'))`; payload beperken tot `{entityType, action, id}` (de client invalideert toch alleen queries); CORS-origin beperken tot de eigen origin.
Regression test (proposal): vitest met socket.io-client: verbinding zonder cookie → `connect_error`; met geldige sessie → ontvangt event met alleen id.
