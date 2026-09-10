// Raw-TCP SMTP stub (variant of docs/audit/wip/scripts/dm-smtp-stub.cjs) that also
// logs the full DATA payload (not just subject/attachment metadata) so the HTML
// body can be inspected for unescaped user-controlled text.
const net = require('net');
const fs = require('fs');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 2525;
const LOG_FILE = process.argv[3] || 'docs/audit/wip/scripts/sec/sr-smtp-log.jsonl';

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let dataBuf = '';
  let session = { from: null, rcpt: [] };

  socket.write('220 audit-smtp-stub ESMTP\r\n');

  socket.on('data', (chunk) => {
    if (inData) {
      dataBuf += chunk.toString('utf8');
      if (dataBuf.endsWith('\r\n.\r\n')) {
        inData = false;
        fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...session, fullData: dataBuf }) + '\n');
        socket.write('250 OK: message queued\r\n');
      }
      return;
    }
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write('250-audit-smtp-stub\r\n250-AUTH LOGIN PLAIN\r\n250 OK\r\n');
      } else if (upper.startsWith('AUTH')) {
        socket.write('235 Authentication successful\r\n');
      } else if (upper.startsWith('MAIL FROM')) {
        session.from = line;
        socket.write('250 OK\r\n');
      } else if (upper.startsWith('RCPT TO')) {
        session.rcpt.push(line);
        socket.write('250 OK\r\n');
      } else if (upper.startsWith('DATA')) {
        inData = true;
        dataBuf = '';
        socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
      } else if (upper.startsWith('QUIT')) {
        socket.write('221 Bye\r\n');
        socket.end();
      } else if (upper.startsWith('RSET')) {
        session = { from: null, rcpt: [] };
        socket.write('250 OK\r\n');
      } else {
        socket.write('250 OK\r\n');
      }
    }
  });
  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SMTP stub listening on 127.0.0.1:${PORT}, logging to ${LOG_FILE}`);
});
