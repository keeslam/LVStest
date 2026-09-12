const { Session } = require('./lib.cjs');
const PW = 'P36brgss!23';
const ACCOUNTS = [
  { username: 'AUDIT-P36B-nobody',  role: 'user',    permissions: [] },
  { username: 'AUDIT-P36B-viewer',  role: 'user',    permissions: ['view_vehicles','view_customers','view_reservations','view_reports','view_portal','view_damage_checks','view_fines','view_dashboard'] },
  { username: 'AUDIT-P36B-manager', role: 'manager', permissions: ['manage_users','manage_backups','manage_expenses','manage_pdf_templates','manage_fines','manage_settings','manage_portal','manage_documents','manage_reservations','manage_vehicles','manage_damage_checks','manage_reports','view_portal'] },
];
(async () => {
  const a = new Session('admin', { fakeIp: '198.51.100.11' });
  const lr = await a.loginStaff('admin', 'admin123');
  console.log('admin login', lr.status, lr.text.slice(0,200));
  const list = await a.get('/api/users');
  const existing = (list.json || []).reduce((m,u)=>(m[u.username]=u,m),{});
  for (const acc of ACCOUNTS) {
    if (existing[acc.username]) { console.log('exists', acc.username, existing[acc.username].id, JSON.stringify(existing[acc.username].permissions)); continue; }
    const r = await a.post('/api/users', { username: acc.username, password: PW, role: acc.role, permissions: acc.permissions, fullName: acc.username, email: acc.username.toLowerCase()+'@example.com' });
    console.log('create', acc.username, r.status, r.text.slice(0,300));
  }
  const list2 = await a.get('/api/users');
  for (const u of (list2.json||[])) if (u.username.startsWith('AUDIT-P36B')) console.log('->', u.id, u.username, u.role, JSON.stringify(u.permissions), 'active=',u.active);
})();
