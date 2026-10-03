// Parses database/migrations/*.sql (the canonical schema) into plain JS structures.
// Used by: gen-mock, check-consistency, gen-docs (DATABASE_SCHEMA.md, ER diagram).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readMigrations() {
  const dir = path.join(ROOT, 'database/migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ file: f, sql: readFileSync(path.join(dir, f), 'utf8') }));
}

function splitTopLevel(body) {
  const items = []; let depth = 0; let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { items.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) items.push(cur);
  return items;
}

/** Encode punctuation inside SQL `--` comments so they cannot break paren/comma scanning. */
function protectComments(sql) {
  return sql.split('\n').map((l) => {
    const i = l.indexOf('--');
    if (i < 0) return l;
    return l.slice(0, i) + '--' + l.slice(i + 2).replace(/\(/g, '⟦').replace(/\)/g, '⟧').replace(/,/g, '﹐');
  }).join('\n');
}
const unprotect = (s) => s.replace(/⟦/g, '(').replace(/⟧/g, ')').replace(/﹐/g, ',');

export function parseSchema() {
  const migrations = readMigrations();
  const sql = protectComments(migrations.map((m) => m.sql).join('\n'));
  const enums = {};
  for (const m of sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([\s\S]*?)\);/g)) {
    enums[m[1]] = [...m[2].matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]);
  }
  const sequences = [...sql.matchAll(/CREATE SEQUENCE (\w+)/g)].map((m) => m[1]);
  const tables = {};
  const re = /CREATE TABLE (\w+) \(/g;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1];
    let i = re.lastIndex; let depth = 1;
    while (depth > 0) { const c = sql[i++]; if (c === '(') depth++; else if (c === ')') depth--; }
    const body = sql.slice(re.lastIndex, i - 1);
    const columns = []; const constraints = []; const fks = [];
    let prev = null;
    for (const raw of splitTopLevel(body)) {
      // leading comment lines belong to the previous column (they follow its trailing comma)
      const lines = raw.split('\n');
      const lead = [];
      while (lines.length && (lines[0].trim() === '' || lines[0].trim().startsWith('--'))) {
        const t = lines.shift().trim(); if (t.startsWith('--')) lead.push(t.slice(2).trim());
      }
      if (prev && lead.length) prev.description = [prev.description, unprotect(lead.join(' '))].filter(Boolean).join(' ');
      const code = lines.join('\n');
      const def = code.split('\n').map((l) => l.replace(/--.*$/, '')).join(' ').replace(/\s+/g, ' ').trim();
      const trailing = lines.map((l) => (l.includes('--') ? l.slice(l.indexOf('--') + 2).trim() : '')).filter(Boolean).join(' ');
      if (!def) continue;
      if (/^(CHECK|UNIQUE|CONSTRAINT|PRIMARY KEY|EXCLUDE|FOREIGN KEY)\b/i.test(def)) {
        constraints.push(def); prev = null; continue;
      }
      const cm = def.match(/^(\w+) (.+)$/);
      const col = { name: cm[1], rawType: '', type: '', notNull: false, hasDefault: false, pk: false, unique: false, references: null, description: unprotect(trailing) };
      const rest = cm[2];
      const typeEnd = rest.search(/\b(NOT NULL|NULL|DEFAULT|PRIMARY KEY|UNIQUE|REFERENCES|CHECK)\b/);
      col.rawType = (typeEnd < 0 ? rest : rest.slice(0, typeEnd)).trim();
      col.type = col.rawType.replace(/\(.*\)/, '').replace(/\[\]$/, '[]').toLowerCase();
      col.notNull = /\bNOT NULL\b/.test(rest) || /\bPRIMARY KEY\b/.test(rest);
      col.hasDefault = /\bDEFAULT\b/.test(rest);
      col.pk = /\bPRIMARY KEY\b/.test(rest);
      col.unique = /\bUNIQUE\b/.test(rest);
      const ref = rest.match(/REFERENCES (\w+)\(/);
      if (ref) { col.references = ref[1]; fks.push({ column: col.name, table: ref[1] }); }
      columns.push(col); prev = col;
    }
    tables[name] = { name, columns, constraints, fks };
  }
  // standalone indexes (for docs)
  const indexes = [...sql.matchAll(/CREATE (UNIQUE )?INDEX (\w+) ON (\w+) ([^;]+);/g)]
    .map((x) => ({ unique: !!x[1], name: x[2], table: x[3], def: x[4].replace(/\s+/g, ' ').trim() }));
  return { enums, tables, sequences, indexes };
}

/** column is required in a seed row if NOT NULL and has no default (informational). */
export const isRequired = (c) => c.notNull && !c.hasDefault;
