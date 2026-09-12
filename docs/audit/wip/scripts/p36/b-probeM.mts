// BUG-098 (symlink containment) and BUG-099 (outbound timeout) - runtime, in-process.
import fs from 'fs';
import path from 'path';
import http from 'http';
import { resolveDocumentFilePath } from '../../../../../server/services/document-paths.ts';
import { fetchWithTimeout } from '../../../../../server/utils/security/outboundGuard.ts';
import { geocodeTimeoutMs, routeTimeoutMs } from '../../../../../server/geocoding.ts';

const uploads = process.env.UPLOADS_DIR!;
console.log('UPLOADS_DIR =', uploads);

// --- BUG-098 ---------------------------------------------------------------
const outsideFile = path.join(uploads, '..', 'AUDIT-P36B-outside-secret.txt');
fs.writeFileSync(outsideFile, 'AUDIT-P36B secret outside the uploads root\n');
const linkPath = path.join(uploads, 'AUDIT-P36B-leak');
try { fs.unlinkSync(linkPath); } catch { /* not there */ }
let linkMade = false;
try { fs.symlinkSync(outsideFile, linkPath, 'file'); linkMade = true; }
catch (e: any) { console.log('symlink could not be created on this host:', e.code); }

if (linkMade) {
  console.log('symlink created:', linkPath, '->', fs.readlinkSync(linkPath));
  const r = resolveDocumentFilePath('AUDIT-P36B-leak');
  console.log('resolveDocumentFilePath("AUDIT-P36B-leak") ->', r === null ? 'NULL (refused)' : r);
  const r2 = resolveDocumentFilePath(linkPath);
  console.log('resolveDocumentFilePath(<absolute link>)   ->', r2 === null ? 'NULL (refused)' : r2);
  // control: a real file inside uploads still resolves
  const ok = path.join(uploads, 'AUDIT-P36B-real.txt');
  fs.writeFileSync(ok, 'ok');
  console.log('control resolveDocumentFilePath("AUDIT-P36B-real.txt") ->', resolveDocumentFilePath('AUDIT-P36B-real.txt'));
  fs.unlinkSync(ok);
  fs.unlinkSync(linkPath);
}
fs.unlinkSync(outsideFile);
console.log('cleanup done; link and files removed');

// --- BUG-099 ---------------------------------------------------------------
console.log('\ngeocodeTimeoutMs =', geocodeTimeoutMs(), 'routeTimeoutMs =', routeTimeoutMs());
const hang = http.createServer(() => { /* never answers */ });
await new Promise<void>((r) => hang.listen(0, '127.0.0.1', () => r()));
const port = (hang.address() as any).port;
const t0 = Date.now();
try {
  await fetchWithTimeout(`http://127.0.0.1:${port}/never`, { timeoutMs: 1500 });
  console.log('fetchWithTimeout RESOLVED (no timeout!) after', Date.now() - t0, 'ms');
} catch (e: any) {
  console.log('fetchWithTimeout aborted after', Date.now() - t0, 'ms with', e.name + ': ' + String(e.message).slice(0, 80));
}
hang.close();
process.exit(0);
