const { join } = require('path');
const base = 'C:\\backups';
console.log('abs windows path:', join(base, 'C:\\Windows\\win.ini'));
console.log('unc path:', join(base, '\\\\server\\share\\file.txt'));
console.log('dotdot:', join(base, '..\\..\\Windows\\win.ini'));
console.log('dotdot fwd:', join(base, '../../Windows/win.ini'));
