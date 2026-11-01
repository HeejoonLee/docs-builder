// Builds fcpu-arc42.html and fcpu-arc42.pdf from fcpu-arc42.md.
// The markdown is the source; the HTML has the same content plus navigation.
//
//   npm install && npm run build
//
// Needs a Chromium for playwright-core: set CHROMIUM_PATH, or have one in
// ~/.cache/ms-playwright. Korean text needs a Korean font; on WSL the Windows
// fonts (Malgun Gothic) are picked up automatically. If Chromium fails on a
// missing libasound.so.2, install libasound2t64 or point LD_LIBRARY_PATH at it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import GithubSlugger from 'github-slugger';
import { chromium } from 'playwright-core';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(dir, 'fcpu-arc42.md');
const OUT_HTML = path.join(dir, 'fcpu-arc42.html');
const OUT_PDF = path.join(dir, 'fcpu-arc42.pdf');
const FONT_STACK = `"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", sans-serif`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- markdown → HTML body ----------
const md = fs.readFileSync(SRC, 'utf8');
const slugger = new GithubSlugger();
const headings = [];

const marked = new Marked({ gfm: true });
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slugger.slug(text);
      const html = this.parser.parseInline(tokens);
      if (depth >= 2 && depth <= 4) headings.push({ depth, id, text: html });
      const anchor = depth >= 2 ? `<a class="anchor" href="#${id}" aria-label="link">#</a>` : '';
      return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`;
    },
    code({ text, lang }) {
      if (lang === 'mermaid') return `<div class="diagram"><pre class="mermaid">${esc(text)}</pre></div>\n`;
      return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${esc(text)}</code></pre>\n`;
    },
    table(token) {
      // wrap tables so wide ones scroll instead of overflowing
      const header = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
      const rows = token.rows.map((r) => '<tr>' + r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('') + '</tr>').join('\n');
      return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
    },
  },
});
const body = marked.parse(md);
const title = (md.match(/^# (.+)$/m) || [, 'FCPU Design'])[1];

// ---------- TOC ----------
function buildToc() {
  let html = '<ul class="toc">';
  let open2 = false, open3 = false;
  for (const h of headings) {
    if (h.depth === 2) {
      if (open3) { html += '</ul></li>'; open3 = false; }
      if (open2) html += '</ul></li>';
      html += `<li class="l2"><a href="#${h.id}">${h.text}</a><ul>`;
      open2 = true;
    } else if (h.depth === 3) {
      if (open3) html += '</ul></li>';
      html += `<li class="l3"><a href="#${h.id}">${h.text}</a><ul>`;
      open3 = true;
    } else {
      html += `<li class="l4"><a href="#${h.id}">${h.text}</a></li>`;
    }
  }
  if (open3) html += '</ul></li>';
  if (open2) html += '</ul></li>';
  return html + '</ul>';
}
const toc = buildToc();

// ---------- page ----------
const css = `
:root { --fg:#1f2328; --muted:#59636e; --border:#d1d9e0; --bg-soft:#f6f8fa; --accent:#0969da; --side:300px; }
* { box-sizing: border-box; }
html { scroll-padding-top: 16px; }
body { margin:0; font-family:${FONT_STACK}; color:var(--fg); line-height:1.65; font-size:15px; }
#sidebar { position:fixed; top:0; left:0; bottom:0; width:var(--side); overflow-y:auto; border-right:1px solid var(--border); background:var(--bg-soft); padding:16px 12px 40px; font-size:13.5px; }
#sidebar .doc-title { font-weight:700; font-size:15px; margin:0 4px 10px; }
#sidebar input { width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; margin-bottom:10px; font:inherit; }
#sidebar .tools { display:flex; gap:6px; margin-bottom:10px; }
#sidebar .tools button { flex:1; font:inherit; font-size:12px; padding:3px 0; border:1px solid var(--border); background:#fff; border-radius:6px; cursor:pointer; }
.toc, .toc ul { list-style:none; margin:0; padding:0; }
.toc ul { padding-left:12px; display:none; }
.toc li.expanded > ul, body.expand-all .toc ul, body.filtering .toc ul { display:block; }
.toc a { display:block; padding:2px 6px; border-radius:4px; color:var(--fg); text-decoration:none; }
.toc li.l2 > a { font-weight:600; margin-top:4px; }
.toc li.l4 > a { color:var(--muted); font-size:12.5px; }
.toc a:hover { background:#e6eaef; }
.toc a.active { background:#ddf4ff; color:var(--accent); }
.toc li.hidden { display:none; }
main { margin-left:var(--side); padding:24px 48px 120px; max-width:calc(var(--side) + 1100px); }
h1 { font-size:2em; border-bottom:1px solid var(--border); padding-bottom:.3em; }
h2 { font-size:1.55em; border-bottom:1px solid var(--border); padding-bottom:.3em; margin-top:2.2em; }
h3 { font-size:1.25em; margin-top:1.8em; }
h4 { font-size:1.05em; margin-top:1.5em; }
h5 { font-size:1em; margin-top:1.3em; }
.anchor { margin-left:.4em; color:var(--border); text-decoration:none; font-weight:400; visibility:hidden; }
h2:hover .anchor, h3:hover .anchor, h4:hover .anchor { visibility:visible; }
a { color:var(--accent); }
code { font-family: "Cascadia Mono", Consolas, "D2Coding", monospace, ${FONT_STACK}; font-size:.88em; background:#eff1f3; padding:.1em .35em; border-radius:4px; }
pre { background:var(--bg-soft); border:1px solid var(--border); border-radius:6px; padding:12px 14px; overflow-x:auto; line-height:1.5; }
pre code { background:none; padding:0; font-size:13px; }
.table-wrap { overflow-x:auto; margin:1em 0; }
table { border-collapse:collapse; font-size:14px; }
th, td { border:1px solid var(--border); padding:5px 10px; vertical-align:top; }
th { background:var(--bg-soft); text-align:left; }
tr:nth-child(2n) td { background:#fafbfc; }
blockquote { margin:1em 0; padding:.2em 1em; color:var(--muted); border-left:4px solid var(--border); }
.diagram { margin:1em 0; padding:12px; border:1px solid var(--border); border-radius:6px; background:#fff; overflow-x:auto; text-align:center; }
.diagram pre.mermaid { background:none; border:none; padding:0; margin:0; }
#totop { position:fixed; right:20px; bottom:20px; padding:6px 12px; border:1px solid var(--border); border-radius:6px; background:#fff; color:var(--fg); text-decoration:none; font-size:13px; }
#menu { display:none; }
.print-toc { display:none; }
@media (max-width: 900px) {
  #sidebar { transform:translateX(-100%); transition:transform .2s; z-index:10; }
  body.menu-open #sidebar { transform:none; }
  main { margin-left:0; padding:56px 18px 80px; }
  #menu { display:block; position:fixed; top:10px; left:10px; z-index:11; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:#fff; font:inherit; }
}
@media print {
  @page { size:A4; margin:16mm 14mm 18mm; }
  #sidebar, #totop, #menu, .anchor { display:none !important; }
  body { font-size:10.5pt; }
  main { margin:0; padding:0; max-width:none; }
  h2 { break-before:page; margin-top:0; }
  h2, h3, h4 { break-after:avoid; }
  pre, .diagram, tr { break-inside:avoid; }
  .table-wrap { overflow:visible; }
  table { font-size:9pt; }
  pre code { font-size:8.5pt; }
  .print-toc { display:block; break-before:page; }
  .print-toc ul { list-style:none; padding-left:14px; }
  .print-toc > ul { padding-left:0; }
  .print-toc ul ul { display:block; }
  .print-toc a { color:var(--fg); text-decoration:none; }
  .print-toc li.l2 > a { font-weight:700; }
  .print-toc li.l4 { display:none; }
}
`;

const js = `
(() => {
  const links = [...document.querySelectorAll('#sidebar .toc a')];
  const byId = new Map(links.map(a => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
  const heads = [...document.querySelectorAll('main h2[id], main h3[id], main h4[id]')].filter(h => byId.has(h.id));
  function expandTo(a) {
    document.querySelectorAll('#sidebar li.expanded').forEach(li => li.classList.remove('expanded'));
    for (let li = a.parentElement; li && li.matches('#sidebar li'); li = li.parentElement.closest('li')) li.classList.add('expanded');
  }
  let current = null;
  function update() {
    let h = heads[0];
    for (const x of heads) { if (x.getBoundingClientRect().top <= 90) h = x; else break; }
    const a = h && byId.get(h.id);
    if (a && a !== current) {
      current && current.classList.remove('active');
      a.classList.add('active'); current = a; expandTo(a);
      const box = document.getElementById('sidebar').getBoundingClientRect(), r = a.getBoundingClientRect();
      if (r.top < box.top + 60 || r.bottom > box.bottom - 20) a.scrollIntoView({ block: 'center' });
    }
  }
  addEventListener('scroll', update, { passive: true }); update();
  links.forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));
  const f = document.getElementById('filter');
  f.addEventListener('input', () => {
    const q = f.value.trim().toLowerCase();
    document.body.classList.toggle('filtering', !!q);
    document.querySelectorAll('#sidebar li').forEach(li => li.classList.remove('hidden'));
    if (!q) return;
    document.querySelectorAll('#sidebar li').forEach(li => {
      if (!li.textContent.toLowerCase().includes(q)) li.classList.add('hidden');
    });
  });
  document.getElementById('expand').onclick = () => document.body.classList.add('expand-all');
  document.getElementById('collapse').onclick = () => document.body.classList.remove('expand-all');
  document.getElementById('menu').onclick = () => document.body.classList.toggle('menu-open');
})();
`;

const page = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<!-- Generated from fcpu-arc42.md by build.mjs. Do not edit by hand. -->
<style>${css}</style>
</head>
<body>
<button id="menu">☰ 목차</button>
<nav id="sidebar">
  <div class="doc-title">${esc(title)}</div>
  <input id="filter" type="search" placeholder="목차 검색…">
  <div class="tools"><button id="expand">모두 펼치기</button><button id="collapse">접기</button></div>
  ${toc}
</nav>
<main>
${body.replace(/(<h2 )/, `<section class="print-toc"><h1>목차</h1>${toc}</section>\n$1`)}
</main>
<a id="totop" href="#">↑ 맨 위</a>
<script>${js}</script>
</body>
</html>`;

// ---------- render diagrams and print ----------
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined; // let playwright-core try its default
}

function fontEnv() {
  const winFonts = '/mnt/c/Windows/Fonts';
  if (!fs.existsSync(winFonts)) return process.env;
  const conf = path.join(os.tmpdir(), 'fcpu-doc-fonts.conf');
  fs.writeFileSync(conf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>${winFonts}</dir>
<cachedir>${path.join(os.tmpdir(), 'fcpu-doc-fontcache')}</cachedir></fontconfig>`);
  return { ...process.env, FONTCONFIG_FILE: conf };
}

const mermaidJs = fs.readFileSync(path.join(dir, 'node_modules/mermaid/dist/mermaid.min.js'), 'utf8');
const browser = await chromium.launch({ executablePath: findChromium(), env: fontEnv() });
try {
  const tab = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await tab.setContent(page, { waitUntil: 'load' });
  await tab.addScriptTag({ content: mermaidJs });
  const errors = await tab.evaluate(async (font) => {
    // eslint-disable-next-line no-undef
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: font, securityLevel: 'strict',
      flowchart: { htmlLabels: true, useMaxWidth: true }, sequence: { useMaxWidth: true } });
    const errs = [];
    for (const el of document.querySelectorAll('pre.mermaid')) {
      try { await mermaid.run({ nodes: [el] }); } // eslint-disable-line no-undef
      catch (e) { errs.push(String(e && e.message || e).slice(0, 300) + '\n---\n' + el.textContent.slice(0, 200)); }
    }
    // drop the injected mermaid library; diagrams are now inline SVG
    document.querySelectorAll('script').forEach((s) => { if (s.textContent.length > 100000) s.remove(); });
    return errs;
  }, FONT_STACK);
  if (errors.length) { console.error('Mermaid errors:\n' + errors.join('\n\n')); process.exitCode = 1; }

  fs.writeFileSync(OUT_HTML, '<!DOCTYPE html>\n' + (await tab.evaluate(() => document.documentElement.outerHTML)));
  console.log('wrote', path.relative(process.cwd(), OUT_HTML));

  await tab.emulateMedia({ media: 'print' });
  await tab.pdf({
    path: OUT_PDF, format: 'A4', printBackground: true, outline: true, tagged: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;color:#888;font-family:${FONT_STACK.replace(/"/g, "'")}">${esc(title)}</div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#888;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  });
  console.log('wrote', path.relative(process.cwd(), OUT_PDF));
} finally {
  await browser.close();
}
