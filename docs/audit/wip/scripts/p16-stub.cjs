// Phase 16 SMTP stub: extends dm-smtp-stub.cjs with switchable failure modes
// and full DATA capture. Usable in-process (module) or standalone (CLI).
//   node docs/audit/wip/scripts/p16-stub.cjs [port] [mode] [logfile]
// Modes:
//   ok            normal happy path (220 banner, AUTH ok, 250 everywhere, 250 after DATA)
//   silent        accept TCP, never send the banner (greeting timeout)
//   hang-ehlo     send banner, never answer EHLO (command timeout)
//   drop          accept TCP, close immediately
//   drop-data     accept everything, close socket right after DATA body (no 250)
//   data-hang     accept everything, never answer the DATA body (socketTimeout path)
//   auth535       reply 535 to AUTH
//   rcpt550       reply 550 to every RCPT TO
//   tls-required  reply 530 5.7.0 Must issue a STARTTLS command first to MAIL FROM (no STARTTLS advertised)
//   starttls-only advertise STARTTLS and 530 on MAIL FROM (client will try STARTTLS -> stub drops)
'use strict';
const net = require('net');
const fs = require('fs');

function start(opts = {}) {
  const port = opts.port || 2525;
  const logFile = opts.logFile || 'docs/audit/wip/scripts/p16-smtp-log.jsonl';
  const state = { mode: opts.mode || 'ok', connections: 0, open: new Set(), messages: [], log: [] };

  const server = net.createServer((socket) => {
    state.connections++;
    state.open.add(socket);
    socket.on('close', () => state.open.delete(socket));
    socket.on('error', () => {});
    const mode = state.mode; // mode fixed per connection
    let buffer = '';
    let inData = false;
    let dataBuf = '';
    let session = { from: null, rcpt: [], authLines: 0 };
    const connTag = { mode, id: state.connections, at: new Date().toISOString() };
    state.log.push({ event: 'connect', ...connTag });

    if (mode === 'drop') { socket.destroy(); return; }
    if (mode === 'silent') { return; } // never greet
    socket.write('220 audit-smtp-stub ESMTP\r\n');
    if (mode === 'hang-ehlo') { return; } // greet then ignore everything

    socket.on('data', (chunk) => {
      if (inData) {
        dataBuf += chunk.toString('latin1');
        if (dataBuf.endsWith('\r\n.\r\n')) {
          inData = false;
          const raw = dataBuf.slice(0, -5);
          const headersEnd = raw.indexOf('\r\n\r\n');
          const headers = headersEnd >= 0 ? raw.slice(0, headersEnd) : raw;
          const subj = headers.match(/^Subject: (.*)$/mi);
          const fromH = headers.match(/^From: (.*)$/mi);
          const toH = headers.match(/^To: (.*)$/mi);
          const rec = {
            ts: new Date().toISOString(), conn: connTag, mailFrom: session.from, rcptTo: session.rcpt,
            headerFrom: fromH ? fromH[1] : null, headerTo: toH ? toH[1] : null,
            subject: subj ? subj[1].trim() : null,
            hasHtml: /Content-Type: text\/html/i.test(raw), hasText: /Content-Type: text\/plain/i.test(raw),
            hasAttachment: /Content-Disposition: attachment/i.test(raw),
            attachmentFilenames: [...raw.matchAll(/Content-Disposition: attachment;\s*filename="?([^"\r\n]+)"?/gi)].map(m => m[1]),
            dataSize: raw.length, raw,
          };
          state.messages.push(rec);
          fs.appendFileSync(logFile, JSON.stringify(rec) + '\n');
          if (mode === 'data-hang') return; // never answer
          if (mode === 'drop-data') { socket.destroy(); return; }
          socket.write('250 OK: message queued\r\n');
        }
        return;
      }
      buffer += chunk.toString('latin1');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const upper = line.toUpperCase();
        state.log.push({ event: 'cmd', id: connTag.id, line: line.slice(0, 120) });
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          const ext = mode === 'starttls-only' ? '250-STARTTLS\r\n' : '';
          socket.write('250-audit-smtp-stub\r\n' + ext + '250-AUTH LOGIN PLAIN\r\n250 OK\r\n');
        } else if (upper.startsWith('STARTTLS')) {
          socket.write('220 Ready to start TLS\r\n'); socket.destroy(); // stub cannot speak TLS; observe client behaviour
        } else if (upper.startsWith('AUTH PLAIN')) {
          if (mode === 'auth535') socket.write('535 5.7.8 Authentication credentials invalid\r\n');
          else socket.write('235 Authentication successful\r\n');
        } else if (upper.startsWith('AUTH LOGIN')) {
          session.authLines = 0;
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM')) {
          session.from = line; session.rcpt = []; // new envelope
          if (mode === 'tls-required' || mode === 'starttls-only') socket.write('530 5.7.0 Must issue a STARTTLS command first\r\n');
          else socket.write('250 OK\r\n');
        } else if (upper.startsWith('RCPT TO')) {
          session.rcpt.push(line);
          if (mode === 'rcpt550') socket.write('550 5.1.1 The email account that you tried to reach does not exist\r\n');
          else socket.write('250 OK\r\n');
        } else if (upper.startsWith('DATA')) {
          inData = true; dataBuf = '';
          socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 Bye\r\n'); socket.end();
        } else if (upper.startsWith('RSET')) {
          session = { from: null, rcpt: [], authLines: 0 }; socket.write('250 OK\r\n');
        } else if (upper.startsWith('NOOP')) {
          socket.write('250 OK\r\n');
        } else if (/^[A-Za-z0-9+/=]+$/.test(line.trim()) && line.trim().length > 0) {
          // base64 continuation of AUTH LOGIN (username, then password)
          session.authLines++;
          if (session.authLines === 1) socket.write('334 UGFzc3dvcmQ6\r\n');
          else if (mode === 'auth535') socket.write('535 5.7.8 Authentication credentials invalid\r\n');
          else socket.write('235 Authentication successful\r\n');
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port, state, server,
        setMode(m) { state.mode = m; },
        dropAll() { for (const s of state.open) s.destroy(); },
        stop() { for (const s of state.open) s.destroy(); return new Promise(r => server.close(() => r())); },
      });
    });
  });
}

module.exports = { start };

if (require.main === module) {
  const port = process.argv[2] ? parseInt(process.argv[2]) : 2525;
  const mode = process.argv[3] || 'ok';
  const logFile = process.argv[4];
  start({ port, mode, logFile }).then(() => console.log('p16 SMTP stub listening on 127.0.0.1:' + port + ' mode=' + mode));
}
