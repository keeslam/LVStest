const https = require('http');
const fs = require('fs');
const jar = fs.readFileSync('docs/audit/wip/scripts/dm-jar.txt','utf8');
const csrf = jar.split('\n').find(l=>l.includes('XSRF-TOKEN')).split('\t').pop().trim();
const longName = 'AUDIT-' + 'Klant🎉'.repeat(50) + '-<b>bold</b>-end'; // >300 chars with emoji and html tag
const body = JSON.stringify({
  name: longName,
  email: 'audit-edge@example.com',
  customerType: 'private',
  address: 'AUDIT <b>Hoofdstraat</b> 123 🚗',
  city: 'AUDIT-Stad',
});
console.log('name length:', longName.length);
const cookies = jar.split('\n').filter(l=>l && !l.startsWith('#') || l.startsWith('#HttpOnly')).map(l=>{
  const parts = l.split('\t');
  return parts.length>=7 ? `${parts[5]}=${parts[6]}` : null;
}).filter(Boolean).join('; ');
const req = https.request('http://localhost:5001/api/customers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf,
    'Cookie': cookies,
    'Content-Length': Buffer.byteLength(body),
  }
}, res => {
  let data='';
  res.on('data', c=>data+=c);
  res.on('end', ()=>{ console.log('STATUS', res.statusCode); console.log(data); });
});
req.write(body);
req.end();
