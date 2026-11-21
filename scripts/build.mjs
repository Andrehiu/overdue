// Bundles the game into ONE self-contained HTML file (dist/overdue.html) plus dist/version.json.
// The live GitHub Pages site deploys exactly this, so a phone can never mix old and new code.
//   npm run build                 -> full HTML document (keeps the home-screen icon + manifest tags)
//   npm run build -- --fragment   -> body-only fragment (for hosts that supply <head>, e.g. claude.ai pages)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const fragment = process.argv.includes('--fragment');
const out = resolve(process.argv.find((a) => a.endsWith('.html')) || `${root}/dist/overdue.html`);

// Version stamp: human version from package.json, exact commit from CI or local git.
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
let commit = (process.env.GITHUB_SHA || '').slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short=7 HEAD', { cwd: root }).toString().trim(); } catch { commit = 'unknown'; } }
const stamp = { version: pkg.version, commit, built: new Date().toISOString() };

const js = (await build({ entryPoints: [`${root}/src/main.js`], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' }))
  .outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${root}/src/game.css`, 'utf8');
const html = readFileSync(`${root}/index.html`, 'utf8');
const stampTag = `<script>window.__OVERDUE_BUILD__ = ${JSON.stringify(stamp)};</script>`;
const inlineScript = `${stampTag}\n<script>\n${js}\n</script>`;
const inlineStyle = `<style>\n${css}\nhtml, body { height: 100%; }\n</style>`;

let page;
if (fragment) {
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script type="module"[^>]*><\/script>/, '').trim();
  page = `<title>Overdue! Night Shift</title>\n<meta name="theme-color" content="#05030c">\n${inlineStyle}\n${body}\n${inlineScript}\n`;
} else {
  // Keep index.html as-is (head tags for icon/manifest included), swapping in the inlined CSS and JS.
  page = html
    .replace(/<link rel="stylesheet" href="[^"]*game\.css">/, () => inlineStyle)
    .replace(/<script type="module" src="[^"]*main\.js"><\/script>/, () => inlineScript);
  if (page.includes('src/main.js') || page.includes('src/game.css')) throw new Error('build: failed to inline main.js / game.css');
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
if (!fragment) writeFileSync(join(dirname(out), 'version.json'), JSON.stringify(stamp, null, 2) + '\n');
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(1)} KB) — v${stamp.version} · ${stamp.commit}`);
