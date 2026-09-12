// BUG-072 (safe-url helper), BUG-102 (html escaping helper), BUG-057 (start-up assertion).
import { isSafeHttpUrl } from '../../../../../shared/safe-url.ts';
import { escapeHtml } from '../../../../../client/src/lib/html-escape.ts';

console.log('=== BUG-072 isSafeHttpUrl ===');
for (const v of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)  ', 'java\tscript:alert(1)',
  'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)',
  'https://example.com/a.pdf', '/uploads/receipts/a.pdf', 'mailto:a@b.nl']) {
  console.log('  ' + JSON.stringify(v).padEnd(46), isSafeHttpUrl(v));
}

console.log('\n=== BUG-102 escapeHtml ===');
for (const v of ['<script>alert(1)</script>', 'Peugeot "308"', "a<b&c'd"]) {
  console.log('  ' + JSON.stringify(v).padEnd(34), '->', JSON.stringify(escapeHtml(v)));
}
process.exit(0);
