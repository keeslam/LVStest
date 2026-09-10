// Parse app.(get|post|put|patch|delete)("...") and router.(...) across route files.
import fs from 'fs';
import path from 'path';

const ROOT = 'C:\\Users\\kees lam\\Desktop\\LVStest-main\\LVStest-main';

const appFiles = [
  'server/routes.ts',
  'server/portal-auth.ts',
  'server/auth.ts',
  'server/index.ts',
  'server/routes/users.ts',
  'server/routes/portal-admin.ts',
  'server/routes/fines.ts',
  'server/routes/portal-requests.ts',
  'server/routes/expenses.ts',
  'server/routes/pdf-templates.ts',
  'server/routes/custom-notifications.ts',
  'server/routes/backups.ts',
  'server/routes/settings.ts',
  'server/routes/app-settings.ts',
  'server/routes/reports.ts',
  'server/routes/damage-check-templates.ts',
  'server/routes/vehicle-diagram-templates.ts',
  'server/routes/report-and-label-templates.ts',
];

// router-mounted modules: prefix from server/index.ts mounts
const routerMounts = {
  'server/routes/notifications.ts': '/api/notifications',
  'server/routes/vehicles-with-reservations.ts': '/api/vehicles/with-reservations',
  'server/routes/filtered-vehicles.ts': '/api/vehicles/filtered',
  'server/routes/email-templates.ts': '/api/email-templates',
  'server/routes/email-logs.ts': '/api/email-logs',
  'server/routes/apk-date-changes.ts': '/api/apk-date-changes',
};

const METHOD_RE = /\b(app|router)\.(get|post|put|patch|delete)\(\s*(["'`])([^"'`]*)\3/g;

function extractEndpoints(file, absPath, prefix) {
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const results = [];
  let m;
  const re = new RegExp(METHOD_RE);
  while ((m = re.exec(src))) {
    const [full, obj, method, , routePath] = m;
    // line number
    const upto = src.slice(0, m.index);
    const lineNo = upto.split('\n').length;
    // middleware text: same line + up to 2 lines after (until we hit the handler closing or another statement)
    // grab from the call up to matching close paren of first argument list roughly - simpler: grab up to 300 chars or 4 lines
    const startLine = lineNo - 1;
    const context = lines.slice(Math.max(0, startLine - 1), startLine + 4).join(' ');
    // find middleware names between routePath's closing quote and the handler function
    // crude: capture text from after the path string until 'async (req' or 'function' or '(req,'
    const afterIdx = m.index + full.length;
    // Tokenize the rest of the app.get(...) call args by top-level commas,
    // respecting nested (), {}, [] and string literals, up to the matching
    // close-paren of the app.METHOD( call.
    const tailFull = src.slice(afterIdx, afterIdx + 20000);
    let depth = 1; // we are inside the opening '(' of app.METHOD(
    let i = 0;
    let argStart = 0;
    const args = [];
    let inStr = null;
    while (i < tailFull.length && depth > 0) {
      const c = tailFull[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) inStr = null;
        i++; continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; i++; continue; }
      if (c === '/' && tailFull[i + 1] === '/') { const nl = tailFull.indexOf('\n', i); i = nl === -1 ? tailFull.length : nl + 1; continue; }
      if (c === '/' && tailFull[i + 1] === '*') { const end = tailFull.indexOf('*/', i + 2); i = end === -1 ? tailFull.length : end + 2; continue; }
      if (c === '(' || c === '{' || c === '[') { depth++; i++; continue; }
      if (c === ')' || c === '}' || c === ']') {
        depth--;
        if (depth === 0) { args.push(tailFull.slice(argStart, i)); i++; break; }
        i++; continue;
      }
      if (c === ',' && depth === 1) { args.push(tailFull.slice(argStart, i)); argStart = i + 1; i++; continue; }
      i++;
    }
    // args[0] was the path string (already captured by regex, skip it isn't
    // present here since afterIdx is right after the path string+quote... but
    // regex 'full' includes app.METHOD("path" so afterIdx starts right after
    // the closing quote, i.e. at the comma before middleware/handler).
    // First arg here will start with a leading comma-split artifact; drop empties.
    const trimmedArgs = args.map(a => a.trim()).filter(a => a.length > 0);
    // last arg is the handler (arrow fn or function or named handler fn) - drop it
    const middlewareArgs = trimmedArgs.slice(0, -1);
    let middleware = middlewareArgs.join(', ').replace(/\s+/g, ' ').trim();
    const fullPath = prefix ? (prefix + (routePath === '/' ? '' : routePath)) : routePath;
    results.push({
      method: method.toUpperCase(),
      path: fullPath,
      file,
      line: lineNo,
      middleware,
    });
  }
  return results;
}

let all = [];
for (const f of appFiles) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { console.error('MISSING', f); continue; }
  all = all.concat(extractEndpoints(f, abs, null));
}
for (const [f, prefix] of Object.entries(routerMounts)) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) { console.error('MISSING', f); continue; }
  all = all.concat(extractEndpoints(f, abs, prefix));
}

// dedupe exact duplicates (method+path+file+line)
const seen = new Set();
const dedup = [];
for (const e of all) {
  const key = `${e.method} ${e.path} ${e.file}:${e.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  dedup.push(e);
}

dedup.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

fs.writeFileSync(
  path.join(ROOT, 'docs/audit/wip/scripts/matrix/endpoints.json'),
  JSON.stringify(dedup, null, 2)
);
console.log('Total endpoints:', dedup.length);
const byFile = {};
for (const e of dedup) byFile[e.file] = (byFile[e.file] || 0) + 1;
console.log(byFile);
