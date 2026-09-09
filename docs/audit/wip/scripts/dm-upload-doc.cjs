// Manually build a multipart/form-data POST to /api/documents so we can use
// filenames that are too long / unicode without needing a real file with that
// name on disk (Windows MAX_PATH breaks curl's -F @file for those cases).
//
// Usage: node dm-upload-doc.cjs <contentFilePath> <filenameToSend> <documentType> <reservationId> <vehicleId> <mimeType>
const fs = require('fs');
const http = require('http');

const [,, contentFilePath, filenameToSend, documentType, reservationId, vehicleId, mimeType] = process.argv;

const jar = fs.readFileSync('docs/audit/wip/scripts/dm-jar.txt', 'utf8');
const rawLines = jar.split('\n').map(l => l.replace(/\r$/, ''));
const lines = rawLines.filter(l => l && !l.startsWith('#'));
const cookiePairs = [];
for (const l of lines) {
  const parts = l.split('\t');
  if (parts.length >= 7) cookiePairs.push(`${parts[5]}=${parts[6]}`);
}
// also grab the HttpOnly connect.sid line (starts with #HttpOnly_)
for (const raw of rawLines) {
  if (raw.startsWith('#HttpOnly_')) {
    const parts = raw.replace('#HttpOnly_', '').split('\t');
    if (parts.length >= 7) cookiePairs.push(`${parts[5]}=${parts[6]}`);
  }
}
const cookieHeader = cookiePairs.join('; ');
const csrf = (cookiePairs.find(c => c.startsWith('XSRF-TOKEN=')) || '').split('=')[1];

const fileContent = fs.readFileSync(contentFilePath);
const boundary = '----AuditBoundary' + Date.now();

function field(name, value) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

const parts = [];
parts.push(Buffer.from(field('documentType', documentType)));
parts.push(Buffer.from(field('reservationId', reservationId)));
parts.push(Buffer.from(field('vehicleId', vehicleId)));
parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filenameToSend}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
parts.push(fileContent);
parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

const body = Buffer.concat(parts);

const req = http.request('http://localhost:5001/api/documents', {
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
    'Cookie': cookieHeader,
    'X-CSRF-Token': csrf,
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log(data);
  });
});
req.write(body);
req.end();
