// BUG-062 / BUG-078 - runtime evaluation of the two exported helpers.
import { resolveDefaultAdminPassword } from '../../../../../server/initAdmin.ts';
import { buildCspDirectives } from '../../../../../server/middleware/security/headers.ts';
let threw = null;
try { resolveDefaultAdminPassword({ NODE_ENV: 'production' }); } catch (e) { threw = e.message; }
console.log('BUG-062 production without DEFAULT_ADMIN_PASSWORD ->', threw ? 'THROWS: ' + threw.slice(0, 110) : 'RETURNED (no throw)');
const dev = resolveDefaultAdminPassword({ NODE_ENV: 'development' });
console.log('BUG-062 development password ->', JSON.stringify(dev), 'is admin123?', dev === 'admin123');
const prod = buildCspDirectives(true);
console.log('BUG-078 production scriptSrc:', JSON.stringify(prod.scriptSrc));
console.log('BUG-078 production connectSrc:', JSON.stringify(prod.connectSrc), 'imgSrc:', JSON.stringify(prod.imgSrc));
console.log('BUG-078 production contains unsafe-*:', JSON.stringify(prod.scriptSrc).includes('unsafe'));
