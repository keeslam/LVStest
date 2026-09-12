// BUG-098 - containment on the *realised* path, via a directory junction
// planted inside the uploads root (a symlink needs Administrator on Windows).
import fs from 'fs';
import path from 'path';
import { resolveDocumentFilePath, resolveStoredPathForWrite } from '../../../../../server/services/document-paths.ts';

const uploads = process.env.UPLOADS_DIR!;
const link = path.join(uploads, 'AUDIT-P36B-leakdir');
console.log('UPLOADS_DIR =', uploads);
console.log('junction exists:', fs.existsSync(link), '| lstat isSymbolicLink:', fs.lstatSync(link).isSymbolicLink());
console.log('realpath of junction:', fs.realpathSync(link));
const target = 'AUDIT-P36B-leakdir/secret.txt';
console.log('file reachable through it:', fs.existsSync(path.join(uploads, 'AUDIT-P36B-leakdir', 'secret.txt')));
const r = resolveDocumentFilePath(target);
console.log('resolveDocumentFilePath("' + target + '") ->', r === null ? 'NULL (refused)' : r);
const w = resolveStoredPathForWrite(target);
console.log('resolveStoredPathForWrite("' + target + '") ->', w === null ? 'NULL (refused)' : w);
process.exit(0);
