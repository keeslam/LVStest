const fs = require('fs');
const { execFileSync } = require('child_process');
const { admin, veh, R, TS } = require('./a-lib.cjs');
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const sql = (q) => execFileSync(PSQL, ['-U', 'postgres', '-h', 'localhost', 'lvs_regress', '-tAc', q],
  { env: Object.assign({}, process.env, { PGPASSWORD: 'postgres' }) }).toString().trim();
const TARGET = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-uploads\\AUDIT-P36A-throwaway-delete-test.txt';
const PKG = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\package.json';
(async () => {
  const a = await admin();
  const v = await veh(a, 'PT');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200010005fe02fe0000000049454e44ae426082', 'hex');
  const mk = async () => {
    const b = '----P36AP' + Date.now();
    const body = Buffer.concat([
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="vehicleId"\r\n\r\n' + v + '\r\n', 'utf8'),
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="documentType"\r\n\r\nAUDIT-P36A\r\n', 'utf8'),
      Buffer.from('--' + b + '\r\nContent-Disposition: form-data; name="file"; filename="p.png"\r\nContent-Type: image/png\r\n\r\n', 'utf8'),
      png, Buffer.from('\r\n--' + b + '--\r\n', 'utf8')]);
    const r = await a.request('POST', '/api/documents', body, { raw: true, headers: { 'Content-Type': 'multipart/form-data; boundary=' + b } });
    return r.json.id || (r.json.document && r.json.document.id);
  };

  for (const bad of ['package.json', '../LVStest-main/package.json', PKG]) {
    const id = await mk();
    sql("update documents set file_path=" + JSON.stringify(bad).replace(/"/g, "'") + " where id=" + id);
    R('012 doc ' + id + ' file_path in DB', sql('select file_path from documents where id=' + id));
    const vw = await a.get('/api/documents/view/' + id);
    const dl = await a.get('/api/documents/download/' + id);
    R('012 view/download for ' + JSON.stringify(bad), vw.status + '/' + dl.status + ' len=' + vw.text.length + '/' + dl.text.length
      + ' leakedPkg=' + (/rest-express/.test(vw.text) || /rest-express/.test(dl.text)));
  }

  // delete containment: point a row at a real file outside uploads and at one inside
  const idDel = await mk();
  sql("update documents set file_path='../LVStest-main/package.json' where id=" + idDel);
  R('012 delete-target file_path', sql('select file_path from documents where id=' + idDel));
  R('012 package.json exists before', fs.existsSync(PKG));
  const d = await a.del('/api/documents/' + idDel);
  R('012 DELETE doc pointing at package.json', d.status + ' ' + d.text.slice(0, 140));
  R('012 package.json exists after', fs.existsSync(PKG));

  const idDel2 = await mk();
  sql("update documents set file_path='../AUDIT-P36A-throwaway-delete-test.txt' where id=" + idDel2);
  R('012 throwaway exists before', fs.existsSync(TARGET));
  const d2 = await a.del('/api/documents/' + idDel2);
  R('012 DELETE doc pointing at ../throwaway', d2.status + ' ' + d2.text.slice(0, 140));
  R('012 throwaway exists after', fs.existsSync(TARGET));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
