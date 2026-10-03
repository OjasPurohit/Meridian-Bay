// Parses every ```mermaid block in every .md file and every .mmd file with the real Mermaid parser, so diagrams never ship broken.
//   npm run check:mermaid
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/schema.mjs';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try { globalThis.navigator = dom.window.navigator; } catch { /* node 21+ has a read-only navigator */ }
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false });

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { if (['node_modules', '.git'].includes(f)) continue; const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(md|mmd)$/.test(p) && files.push(p); } };
walk(ROOT);

let total = 0, bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const diagrams = f.endsWith('.mmd')
    ? src.split(/^%% ===== Flow .*$/m).map((s) => s.trim()).filter((s) => s && !s.split('\n').every((l) => l.startsWith('%%')))
    : [...src.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [i, d] of diagrams.entries()) {
    total++;
    try { await mermaid.parse(d); }
    catch (e) { bad++; console.log(`  ✘ ${path.relative(ROOT, f)} diagram #${i + 1}: ${String(e.message ?? e).split('\n').slice(0, 4).join(' | ')}`); }
  }
}
console.log(bad ? `\n${bad}/${total} Mermaid diagrams FAILED to parse` : `✔ ${total} Mermaid diagrams parse OK (${files.length} files scanned)`);
process.exit(bad ? 1 : 0);
