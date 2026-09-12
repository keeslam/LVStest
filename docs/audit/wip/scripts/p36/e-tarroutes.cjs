// BUG-219 / BUG-209: which backup routes still shell out to GNU tar on this Windows host?
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const L=require('./e-lib.cjs');
const OUT={};const log=(k,v)=>{OUT[k]=v;console.log('### '+k+': '+JSON.stringify(v));};
(async()=>{
 const [s]=await L.staff(1,'10.36.23.');
 for(const p of ['/api/backups/download-files','/api/backups/download-code','/api/backups/download-data']){
   const r=await L.rreq(s,'GET',p);
   const usesTar=/tar \(child\)|Cannot connect to C:|spawn tar|'tar'/.test(r.text||'');
   log(p,{status:r.status,bytes:Buffer.byteLength(r.text||'','latin1'),tarError:usesTar,body:r.status!==200?(r.text||'').slice(0,300):'(binary ok)'});
 }
 // upload-restore routes (restore-files / restore-data / restore-code) with the typed confirmation
 async function up(route,filename,content,extra){
  const b='----p36e'+Date.now();const parts=[];
  const push=(n,v,f,c)=>{parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${n}"`+(f?`; filename="${f}"`:'')+`\r\n`+(c?`Content-Type: ${c}\r\n`:'')+`\r\n`));parts.push(Buffer.isBuffer(v)?v:Buffer.from(String(v)));parts.push(Buffer.from('\r\n'));};
  push('backup',content,filename,'application/octet-stream');
  for(const [k,v] of Object.entries(extra||{})) push(k,v);
  parts.push(Buffer.from(`--${b}--\r\n`));
  return L.rreq(s,'POST',route,Buffer.concat(parts),{raw:true,headers:{'Content-Type':'multipart/form-data; boundary='+b}});
 }
 // a real (small, safe) tar.gz built with the node 'tar' package that the server itself now uses
 const tmp=path.join(require('os').tmpdir(),'p36e-tar-'+Date.now());
 fs.mkdirSync(path.join(tmp,'uploads','audit-p36e'),{recursive:true});
 fs.writeFileSync(path.join(tmp,'uploads','audit-p36e','AUDIT-P36E-marker.txt'),'audit p36e marker\n');
 let tarOk=false;
 try{ const tarlib=require(path.join(process.cwd(),'node_modules','tar'));
   await tarlib.create({gzip:true,cwd:tmp,file:path.join(tmp,'a.tar.gz')},['uploads']); tarOk=true;
 }catch(e){ log('tarlib.error',String(e.message)); }
 log('builtTarFixture',tarOk);
 if(tarOk){
   const buf=fs.readFileSync(path.join(tmp,'a.tar.gz'));
   const r1=await up('/api/backups/restore-files','AUDIT-P36E-files.tar.gz',buf,{confirm:'AUDIT-P36E-files.tar.gz'});
   log('restore-files.upload',{status:r1.status,body:(r1.text||'').slice(0,400)});
   const marker=path.join('C:\Users\kees lam\Desktop\LVStest-main\regress-uploads','audit-p36e','AUDIT-P36E-marker.txt');
   log('restore-files.landedInUploadsDir',fs.existsSync(marker));
   log('restore-files.landedInCwdUploads',fs.existsSync(path.join(process.cwd(),'uploads','audit-p36e','AUDIT-P36E-marker.txt')));
   const r0=await up('/api/backups/restore-files','AUDIT-P36E-files.tar.gz',buf,{});
   log('restore-files.withoutConfirm',{status:r0.status,body:(r0.text||'').slice(0,200)});
 }
 // restore-data with a tiny valid gz dump
 const gz=zlib.gzipSync(Buffer.from('--\r\n-- PostgreSQL database dump\r\n--\r\nSELECT 1;\r\n--\r\n-- PostgreSQL database dump complete\r\n--\r\n'));
 const r2=await up('/api/backups/restore-data','AUDIT-P36E-tiny.sql.gz',gz,{});
 log('restore-data.withoutConfirm',{status:r2.status,body:(r2.text||'').slice(0,250)});
 fs.writeFileSync(__dirname+'/e-tarroutes.out.json',JSON.stringify(OUT,null,1));
})().catch(e=>{console.error('FATAL',e.stack);fs.writeFileSync(__dirname+'/e-tarroutes.out.json',JSON.stringify(Object.assign(OUT,{FATAL:String(e.stack)}),null,1));});
