// Minimal raw-TCP SMTP stub for capturing outbound mail during the audit.
// Speaks just enough SMTP to let nodemailer complete a send, and logs
// EHLO/MAIL FROM/RCPT TO/DATA to a JSON lines file for inspection.
const net = require('net');
const fs = require('fs');

const PORT = process.argv[2] ? parseInt(process.argv[2]) : 2525;
const LOG_FILE = process.argv[3] || 'docs/audit/wip/scripts/dm-smtp-log.jsonl';

const server = net.createServer((socket) => {
  let buffer = '';
  let inData = false;
  let dataBuf = '';
  let session = { from: null, rcpt: [], subject: null, hasAttachment: false, dataSize: 0 };

  socket.write('220 audit-smtp-stub ESMTP\r\n');

  socket.on('data', (chunk) => {
    if (inData) {
      dataBuf += chunk.toString('utf8');
      if (dataBuf.endsWith('\r\n.\r\n')) {
        inData = false;
        session.dataSize = dataBuf.length;
        const subjMatch = dataBuf.match(/^Subject: (.*)$/mi);
        session.subject = subjMatch ? subjMatch[1].trim() : null;
        session.hasAttachment = /Content-Disposition: attachment/i.test(dataBuf);
        session.attachmentFilenames = [...dataBuf.matchAll(/filename="?([^"\r\n]+)"?/gi)].map(m => m[1]);
        fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...session }) + '\n');
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
        session = { from: null, rcpt: [], subject: null, hasAttachment: false, dataSize: 0 };
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
