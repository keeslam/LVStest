// Documented, isolated repro for AP-xxx: POST /api/portal/requests with a non-JSON
// string in `payload` crashes the whole Node process (uncaught SyntaxError from
// JSON.parse inside a zod .preprocess(), see server/routes/portal.ts ~line 316).
// DO NOT run this against a server other audit agents depend on without warning them -
// it WILL kill the shared dev server for everyone. Confirmed twice (2026-09-09, ~21:50 local).
'use strict';
const { Session } = require('./lib.cjs');
(async () => {
  const s = new Session('crash-repro', { fakeIp: '10.99.99.99' });
  await s.get('/api/portal/csrf-token');
  const login = await s.loginPortal('portaal-test@example.com', 'portaal-test-1234');
  console.log('login', login.status);
  try {
    const r = await s.post('/api/portal/requests', { type: 'other', message: 'AUDIT crash-repro isolated test', payload: 'not-json-at-all' });
    console.log('response', r.status, r.text.slice(0, 500));
  } catch (e) {
    console.error('CLIENT-SIDE ECONNRESET (server crashed) ->', e.message, e.cause?.code);
  }
})();
