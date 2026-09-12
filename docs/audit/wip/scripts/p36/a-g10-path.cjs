const fs = require('fs');
const { admin, R } = require('./a-lib.cjs');
const DOC = Number(process.argv[2]);
const TARGET = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\regress-uploads\\AUDIT-P36A-throwaway-delete-test.txt';
(async () => {
  const a = await admin();
  const v = await a.get('/api/documents/view/' + DOC);
  R('012 view', v.status + ' len=' + v.text.length + ' starts=' + JSON.stringify(v.text.slice(0, 60)));
  const d = await a.get('/api/documents/download/' + DOC);
  R('012 download', d.status + ' len=' + d.text.length + ' starts=' + JSON.stringify(d.text.slice(0, 60)));
  R('012 leaked package.json?', /"name"\s*:\s*"rest-express"/.test(d.text) || /"name"\s*:\s*"rest-express"/.test(v.text));
  R('012 throwaway exists before delete', fs.existsSync(TARGET));
  const del = await a.del('/api/documents/' + DOC);
  R('012 delete (file_path=package.json)', del.status + ' ' + del.text.slice(0, 160));
  R('012 package.json still on disk', fs.existsSync('C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main\\package.json'));
  R('012 throwaway still on disk', fs.existsSync(TARGET));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
