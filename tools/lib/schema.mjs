// Parses database/migrations/*.sql (the canonical schema) into plain JS structures.
// Used by: gen-mock, check-consistency, gen-docs (DATABASE_SCHEMA.md, ER diagram).
//
// 0001 is read as CREATE TABLE / CREATE TYPE / CREATE SEQUENCE statements. Every later migration is replayed statement by
// statement for the subset it may use to evolve the schema:
//   ALTER TABLE t DROP COLUMN c[, DROP COLUMN d ..] | ADD COLUMN c <def> (incl. GENERATED ALWAYS AS (..) STORED) | ADD CONSTRAINT n <def>
//     | DROP CONSTRAINT n | ALTER COLUMN c TYPE y [USING ..] / SET DEFAULT .. / DROP DEFAULT
//   DROP TABLE | CREATE [UNIQUE] INDEX | DROP INDEX | CREATE VIEW | DROP VIEW | COMMENT ON TABLE|COLUMN|VIEW|FUNCTION
//   CREATE TYPE .. AS ENUM | ALTER TYPE x RENAME TO y | ALTER TYPE x ADD VALUE 'V' | DROP TYPE a[, b ..] | DROP SEQUENCE a[, b ..]
// Keep later migrations to that style (no ';' or '--' inside string literals) or extend applyMigration() below.
// Anything else (DO blocks, UPDATE, INSERT, REVOKE, triggers, CREATE FUNCTION, CREATE TEMP TABLE ...) is ignored: it does not
// change the shape. A schema-changing statement outside the supported subset FAILS LOUDLY instead of drifting silently.
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

/** Parses one column definition: "name type [GENERATED ALWAYS AS (expr) STORED] [NOT NULL] [DEFAULT ..] [REFERENCES t(c)] ...".
 *  The generation expression is cut out first so words inside it ("IS NOT NULL") are not mistaken for column flags. */
function parseColumn(def, trailing, fks) {
  const cm = def.match(/^(\w+) (.+)$/);
  const col = { name: cm[1], rawType: '', type: '', notNull: false, hasDefault: false, pk: false, unique: false, references: null, generated: null, description: unprotect(trailing) };
  let rest = cm[2];
  const gi = rest.search(/\bGENERATED ALWAYS AS\b/);
  if (gi >= 0) {
    const open = rest.indexOf('(', gi); let depth = 0; let i = open;
    for (; i < rest.length; i++) { if (rest[i] === '(') depth++; else if (rest[i] === ')') { depth--; if (depth === 0) break; } }
    col.generated = rest.slice(open + 1, i).trim();
    rest = (rest.slice(0, gi) + ' ' + rest.slice(i + 1).replace(/^\s*STORED/, '')).trim();
  }
  const typeEnd = rest.search(/\b(NOT NULL|NULL|DEFAULT|PRIMARY KEY|UNIQUE|REFERENCES|CHECK)\b/);
  col.rawType = (typeEnd < 0 ? rest : rest.slice(0, typeEnd)).trim();
  col.type = col.rawType.replace(/\(.*\)/, '').replace(/\[\]$/, '[]').toLowerCase();
  col.notNull = /\bNOT NULL\b/.test(rest) || /\bPRIMARY KEY\b/.test(rest);
  col.hasDefault = /\bDEFAULT\b/.test(rest) || col.generated !== null; // a generated column is never supplied by a writer
  col.pk = /\bPRIMARY KEY\b/.test(rest);
  col.unique = /\bUNIQUE\b/.test(rest);
  const ref = rest.match(/REFERENCES (\w+)\(/);
  if (ref) { col.references = ref[1]; fks.push({ column: col.name, table: ref[1] }); }
  return col;
}

/** Splits a migration into plain statements: comments and $$ .. $$ bodies removed, whitespace collapsed. */
function statements(sqlText) {
  return sqlText.replace(/\$\$[\s\S]*?\$\$/g, () => '$$$$').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const unquote = (x) => x.replace(/''/g, "'");
const enumValues = (body) => [...body.matchAll(/'([A-Z0-9_]+)'/g)].map((x) => x[1]);
const names = (list) => list.split(',').map((x) => x.trim()).filter(Boolean);

/** Replays the schema-evolving statements of ONE migration onto the parsed model (see header). */
function applyMigration(model, sqlText, file) {
  const { tables, indexes, views, enums, sequences } = model;
  const need = (t, what) => { if (!tables[t]) throw new Error(`${file}: ${what} unknown table ${t}`); return tables[t]; };
  for (const st of statements(sqlText)) {
    let m;
    if ((m = st.match(/^ALTER TABLE (\w+) (DROP COLUMN \w+(?:, DROP COLUMN \w+)*)$/))) {
      const t = need(m[1], 'drops a column of');
      for (const col of [...m[2].matchAll(/DROP COLUMN (\w+)/g)].map((x) => x[1])) {
        const word = new RegExp(`\\b${col}\\b`);
        t.columns = t.columns.filter((c) => c.name !== col);
        t.fks = t.fks.filter((f) => f.column !== col);
        t.constraints = t.constraints.filter((c) => !word.test(c)); // PostgreSQL drops CHECK constraints and indexes that mention the column
        for (const name of Object.keys(indexes)) if (indexes[name].table === m[1] && word.test(indexes[name].def)) delete indexes[name];
      }
    } else if ((m = st.match(/^ALTER TABLE (\w+) ADD COLUMN (.+)$/))) {
      need(m[1], 'adds a column to').columns.push(parseColumn(m[2], '', tables[m[1]].fks));
    } else if ((m = st.match(/^ALTER TABLE (\w+) ADD CONSTRAINT (\w+) (.+)$/))) {
      need(m[1], 'adds a constraint to').constraints.push(`CONSTRAINT ${m[2]} ${m[3]}`);
    } else if ((m = st.match(/^ALTER TABLE (\w+) DROP CONSTRAINT (\w+)$/))) {
      const t = need(m[1], 'drops a constraint of');
      const before = t.constraints.length;
      t.constraints = t.constraints.filter((c) => !c.startsWith(`CONSTRAINT ${m[2]} `));
      if (t.constraints.length === before) throw new Error(`${file}: DROP CONSTRAINT ${m[2]} on ${m[1]}: no such named constraint is known (only named constraints can be dropped)`);
    } else if ((m = st.match(/^ALTER TABLE (\w+) ALTER COLUMN (\w+) TYPE (\w+)(?: USING .*)?$/))) {
      const c = need(m[1], 'retypes a column of').columns.find((x) => x.name === m[2]);
      if (!c) throw new Error(`${file}: ${m[1]}.${m[2]} does not exist`);
      c.rawType = m[3]; c.type = m[3].toLowerCase();
    } else if ((m = st.match(/^ALTER TABLE (\w+) ALTER COLUMN (\w+) (SET|DROP) DEFAULT(?: .*)?$/))) {
      const c = need(m[1], 'changes a default of').columns.find((x) => x.name === m[2]);
      if (!c) throw new Error(`${file}: ${m[1]}.${m[2]} does not exist`);
      c.hasDefault = m[3] === 'SET';
    } else if ((m = st.match(/^DROP TABLE (\w+)$/))) {
      need(m[1], 'drops');
      delete tables[m[1]];
      for (const name of Object.keys(indexes)) if (indexes[name].table === m[1]) delete indexes[name];
    } else if ((m = st.match(/^CREATE (UNIQUE )?INDEX (\w+) ON (\w+) (.+)$/))) {
      indexes[m[2]] = { unique: !!m[1], name: m[2], table: m[3], def: m[4] };
    } else if ((m = st.match(/^DROP INDEX (\w+)$/))) {
      delete indexes[m[1]];
    } else if ((m = st.match(/^CREATE VIEW (\w+)\b/))) {
      views[m[1]] = { name: m[1], comment: '' };
    } else if ((m = st.match(/^DROP VIEW (\w+)$/))) {
      delete views[m[1]];
    } else if ((m = st.match(/^CREATE TYPE (\w+) AS ENUM \((.*)\)$/))) {
      enums[m[1]] = enumValues(m[2]);
    } else if ((m = st.match(/^ALTER TYPE (\w+) ADD VALUE '(\w+)'$/))) {
      if (!enums[m[1]]) throw new Error(`${file}: ALTER TYPE ${m[1]}: unknown enum`);
      enums[m[1]].push(m[2]);
    } else if ((m = st.match(/^ALTER TYPE (\w+) RENAME TO (\w+)$/))) {
      if (!enums[m[1]]) throw new Error(`${file}: ALTER TYPE ${m[1]}: unknown enum`);
      enums[m[2]] = enums[m[1]]; delete enums[m[1]];
      for (const t of Object.values(tables)) for (const c of t.columns) if (c.type === m[1]) { c.type = m[2]; c.rawType = m[2]; } // columns follow their type
    } else if ((m = st.match(/^DROP TYPE (\w+(?:, \w+)*)$/))) {
      for (const n of names(m[1])) {
        if (!enums[n]) throw new Error(`${file}: DROP TYPE ${n}: unknown enum`);
        for (const t of Object.values(tables)) for (const c of t.columns) if (c.type === n) throw new Error(`${file}: DROP TYPE ${n} while ${t.name}.${c.name} still uses it`);
        delete enums[n];
      }
    } else if ((m = st.match(/^DROP SEQUENCE (\w+(?:, \w+)*)$/))) {
      for (const n of names(m[1])) { const i = sequences.indexOf(n); if (i < 0) throw new Error(`${file}: DROP SEQUENCE ${n}: unknown sequence`); sequences.splice(i, 1); }
    } else if ((m = st.match(/^COMMENT ON VIEW (\w+) IS '((?:[^']|'')*)'$/))) {
      if (views[m[1]]) views[m[1]].comment = unquote(m[2]);
    } else if ((m = st.match(/^COMMENT ON TABLE (\w+) IS '((?:[^']|'')*)'$/))) {
      if (tables[m[1]]) tables[m[1]].comment = unquote(m[2]);
    } else if ((m = st.match(/^COMMENT ON COLUMN (\w+)\.(\w+) IS '((?:[^']|'')*)'$/))) {
      const c = tables[m[1]]?.columns.find((x) => x.name === m[2]);
      if (c) c.description = [c.description, unquote(m[3])].filter(Boolean).join(' ');
    } else if (/^COMMENT ON FUNCTION\b/.test(st)) {
      // functions are not part of the table model
    } else if (/^CREATE TABLE \w+ \(/.test(st)) {
      // parsed from the raw text by parseCreateTables (keeps the column comments)
    } else if (/^(ALTER TABLE \w+ (DROP|ADD|ALTER|RENAME|SET)\b|COMMENT ON\b|DROP (TABLE|TYPE|VIEW|SEQUENCE)\b|ALTER TYPE\b|CREATE TYPE\b)/.test(st)) {
      // a statement that changes the schema's shape but is not in the supported subset: fail loudly instead of drifting silently
      throw new Error(`${file}: statement not supported by tools/lib/schema.mjs (extend applyMigration): ${st.slice(0, 100)}`);
    }
  }
}

/** Parses every CREATE TABLE in `text` (comments already protected) into `tables`. */
function parseCreateTables(text, tables) {
  const first = text;
  const re = /CREATE TABLE (\w+) \(/g;
  let m;
  while ((m = re.exec(first))) {
    const name = m[1];
    let i = re.lastIndex; let depth = 1;
    while (depth > 0) { const c = first[i++]; if (c === '(') depth++; else if (c === ')') depth--; }
    const body = first.slice(re.lastIndex, i - 1);
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
      const col = parseColumn(def, trailing, fks);
      columns.push(col); prev = col;
    }
    tables[name] = { name, columns, constraints, fks, comment: '' };
  }
}

export function parseSchema() {
  const migrations = readMigrations();
  const first = protectComments(migrations[0].sql);
  const enums = {};
  for (const m of first.matchAll(/CREATE TYPE (\w+) AS ENUM \(([\s\S]*?)\);/g)) enums[m[1]] = enumValues(m[2]);
  const sequences = [...first.matchAll(/CREATE SEQUENCE (\w+)/g)].map((m) => m[1]);
  const tables = {};
  parseCreateTables(first, tables);
  // Indexes and every schema-evolving statement, in migration order (a later migration may drop and recreate anything).
  const model = { tables, enums, sequences, indexes: {}, views: {} };
  migrations.forEach((mg, n) => {
    if (n === 0) {
      for (const st of statements(mg.sql)) {
        const x = st.match(/^CREATE (UNIQUE )?INDEX (\w+) ON (\w+) (.+)$/);
        if (x) model.indexes[x[2]] = { unique: !!x[1], name: x[2], table: x[3], def: x[4] };
      }
    } else {
      applyMigration(model, mg.sql, mg.file);
      parseCreateTables(protectComments(mg.sql), tables); // tables created by a later migration (after its ALTERs: a new table already uses the final enums)
    }
  });
  return { enums, tables, sequences, indexes: Object.values(model.indexes), views: Object.values(model.views) };
}

/** column is required in a seed row if NOT NULL and has no default (informational). Generated columns are never supplied. */
export const isRequired = (c) => c.notNull && !c.hasDefault;
