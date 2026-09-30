// Fails CI when the production build would break the strict Content-Security-Policy (AD-046):
// an inline <script>, a <style> block, a style="..." attribute or an on...= handler in dist/index.html.
// React's style={} prop is fine: it sets styles through the DOM, which the policy allows.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const problems = [];

for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
  if (!/\bsrc\s*=/i.test(attributes)) problems.push('inline <script> (scripts must be files)');
}
if (/<style\b/i.test(html)) problems.push('<style> block (styles must be files)');
if (/\sstyle\s*=/i.test(html)) problems.push('style="..." attribute');
if (/\son[a-z]+\s*=/i.test(html)) problems.push('inline event handler (on...=)');

if (problems.length > 0) {
  console.error(`dist/index.html breaks the Content-Security-Policy:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('CSP OK: dist/index.html has no inline scripts or styles.');
