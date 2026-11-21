// Bundles the game into ONE self-contained HTML file: dist/overdue.html (≈70 KB, no dependencies).
// Use it to host anywhere, send as a single file, or publish as a claude.ai page.
//   npm run build                 -> full HTML document
//   npm run build -- --fragment   -> body-only fragment (for hosts that supply <head>, e.g. claude.ai pages)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const fragment = process.argv.includes('--fragment');
const out = resolve(process.argv.find((a) => a.endsWith('.html')) || `${root}/dist/overdue.html`);

const js = (await build({ entryPoints: [`${root}/src/main.js`], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' }))
  .outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${root}/src/game.css`, 'utf8');
const html = readFileSync(`${root}/index.html`, 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script type="module"[^>]*><\/script>/, '').trim();

const inner = `<style>\n${css}\nhtml, body { height: 100%; }\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
const page = fragment
  ? `<title>Overdue! Night Shift</title>\n<meta name="theme-color" content="#05030c">\n${inner}`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#05030c">\n<title>Overdue! Night Shift</title>\n</head>\n<body>\n${inner}</body>\n</html>\n`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(1)} KB)`);
