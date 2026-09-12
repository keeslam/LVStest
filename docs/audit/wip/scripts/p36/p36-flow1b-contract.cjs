'use strict';
const { Session } = require('./lib.cjs');
const fs = require('fs');
(async () => {
  const s = new Session('admin'); await s.loginStaff('admin','admin123');
  const P='AUDIT-P36W2';
  const iso=d=>d.toISOString().slice(0,10); const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return iso(d);};
  const cust=await s.post('/api/customers',{name:P+' Klant',companyName:P+' Klant',debtorNumber:'P36W2',address:'Teststraat 2',city:'Testdorp',postalCode:'1234AB',phone:'0612345679',email:'p36w2@example.invalid',status:'active'});
  const veh=await s.post('/api/vehicles',{licensePlate:'P36W02',brand:P,model:'Flow',vehicleType:'personenauto',currentMileage:5000,fuelType:'benzine'});
  const resv=await s.post('/api/reservations',{vehicleId:veh.json.id,customerId:cust.json.id,startDate:day(0),endDate:day(3),status:'booked',type:'standard'});
  const rid=resv.json.id;
  console.log('ids c='+cust.json.id+' v='+veh.json.id+' r='+rid);
  // GET generate-default
  const gd=await s.get('/api/contracts/generate-default/'+rid);
  console.log('GET /api/contracts/generate-default ->',gd.status,'ct='+gd.headers.get('content-type'),'bytes='+gd.text.length, gd.status>=400?gd.text.slice(0,300):'');
  const gg=await s.get('/api/contracts/generate/'+rid);
  console.log('GET /api/contracts/generate ->',gg.status,'ct='+gg.headers.get('content-type'),'bytes='+gg.text.length, gg.status>=400?gg.text.slice(0,300):'');
  const cd=await s.get('/api/contracts/data/'+rid);
  console.log('GET /api/contracts/data ->',cd.status,'bytes='+cd.text.length, cd.status>=400?cd.text.slice(0,200):JSON.stringify(cd.json).slice(0,300));
  // documents after
  const docs=await s.get('/api/documents/reservation/'+rid);
  const list=Array.isArray(docs.json)?docs.json:(docs.json&&docs.json.data)||[];
  console.log('documents ->',docs.status,'n='+list.length, list.map(d=>d.id+':'+d.documentType+':'+(d.fileName||'')).join(' | '));
  // 404 behaviour for an unknown API route (the flow1 step-4 observation)
  const nf=await s.post('/api/contracts/does-not-exist-p36',{});
  console.log('POST unknown /api/ route ->',nf.status,'ct='+nf.headers.get('content-type'),'first60='+nf.text.slice(0,60).replace(/\n/g,' '));
  const nf2=await s.get('/api/does-not-exist-p36');
  console.log('GET unknown /api/ route ->',nf2.status,'ct='+nf2.headers.get('content-type'),'first60='+nf2.text.slice(0,60).replace(/\n/g,' '));
  fs.writeFileSync(__dirname+'/flow1b.json',JSON.stringify({rid,cust:cust.json.id,veh:veh.json.id},null,1));
})();
