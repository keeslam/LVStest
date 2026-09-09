import { Session } from './mt-lib.mjs';
async function tryLogin() {
  const s = new Session('t');
  await s.primeCsrf();
  const l = await s.loginStaff('admin', 'admin123');
  return { status: l.status, text: l.text.slice(0,150) };
}
async function main() {
  for (let i = 0; i < 20; i++) {
    const r = await tryLogin();
    console.log(new Date().toISOString(), r.status, r.text);
    if (r.status === 200) { console.log('LOGIN_OK'); process.exit(0); }
    await new Promise(res => setTimeout(res, 30000));
  }
  console.log('LOGIN_STILL_FAILING');
  process.exit(1);
}
main();
