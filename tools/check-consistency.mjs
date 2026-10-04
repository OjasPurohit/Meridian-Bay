// Automated consistency audit across ALL contracts. Run: npm run check   (exit code 1 on any failure)
// 1 enums.ts <-> SQL enums        2 rows.ts <-> table columns (names, nullability, types)   3 mock-data <-> schema (+FKs, uniques)
// 4 endpoints <-> types/errors/tables/requirements   5 requirements/coverage ids   6 settings keys   7 naming lint
// 8 ownership completeness        9 markdown link integrity                        10 error-code usage
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, parseSchema } from './lib/schema.mjs';
import { parseTypes, enumConstFromType } from './lib/ts-types.mjs';
import * as ENUMS from '../shared/constants/enums.ts';
import { ERROR_CODES } from '../shared/constants/errors.ts';
import * as RULES from '../shared/constants/rules.ts';
import { endpoints, PUB, roleName } from './api/endpoints.mjs';
import { FR, UR, BR, NFR, COVERAGE, MODULES } from './api/requirements.mjs';
import { MODULE_OWNER, TABLE_OWNER, TABLE_PURPOSE } from './api/ownership.mjs';

const schema = parseSchema();
let fails = 0, warns = 0;
const section = (t) => console.log(`\n▸ ${t}`);
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => { fails++; console.log(`  ✘ ${m}`); };
const warn = (m) => { warns++; console.log(`  ! ${m}`); };
const POLYMORPHIC = ['payments.source_id']; // documented in ADR-009 / DATABASE_SCHEMA.md
const API_ONLY = ['SLOT_STATUS', 'STOCK_STATUS', 'REPORT_PERIOD', 'LEAVE_DECISION', 'HISTORY_EVENT_TYPE', 'REPORT_GROUP_BY', 'EXPORT_REPORT'];

// ---------------------------------------------------------------- 1 enums
section('1. enums.ts ↔ SQL enum types');
{
  let n = 0;
  for (const [sqlName, vals] of Object.entries(schema.enums)) {
    const c = ENUMS[sqlName.toUpperCase()];
    if (!c) { bad(`SQL enum ${sqlName} has no constant ${sqlName.toUpperCase()} in enums.ts`); continue; }
    const tsVals = Object.values(c);
    if (JSON.stringify([...tsVals].sort()) !== JSON.stringify([...vals].sort())) bad(`${sqlName}: SQL [${vals}] ≠ TS [${tsVals}]`);
    else n++;
  }
  ok(`${n}/${Object.keys(schema.enums).length} SQL enums match enums.ts`);
  for (const [name, c] of Object.entries(ENUMS)) {
    if (typeof c !== 'object') continue;
    for (const [k, v] of Object.entries(c)) if (k !== v) bad(`${name}.${k} must equal its key (got "${v}")`);
    if (!schema.enums[name.toLowerCase()] && !API_ONLY.includes(name)) bad(`enums.ts constant ${name} is neither a SQL enum nor listed API-only`);
  }
  ok('every enums.ts constant is either stored or declared API-only; keys === values');
}

// ---------------------------------------------------------------- 2 row types
section('2. shared/types/rows.ts ↔ table columns');
const { interfaces, aliases } = parseTypes(['types/rows.ts', 'types/api.ts']);
const singular = (t) => { const w = t.split('_'); const last = w.pop(); const s = last === 'staff' ? 'staff' : last.endsWith('ies') ? last.slice(0, -3) + 'y' : last.endsWith('s') ? last.slice(0, -1) : last; return [...w, s].map((x) => x[0].toUpperCase() + x.slice(1)).join(''); };
const TS_FOR = (c) => {
  if (schema.enums[c.type]) return 'E.' + c.type.split('_').map((x) => x[0].toUpperCase() + x.slice(1)).join('');
  if (c.type === 'uuid') return 'Uuid';
  if (c.type === 'text') return 'string';
  if (c.type === 'timestamptz') return 'IsoDateTime';
  if (c.type === 'date') return 'IsoDate';
  if (c.type === 'time') return 'TimeOfDay';
  if (c.type === 'numeric') return /\(5,2\)/.test(c.rawType) ? 'Percent' : 'Money';
  if (c.type === 'integer') return 'number';
  if (c.type === 'boolean') return 'boolean';
  if (c.type === 'text[]') return 'string[]';
  if (c.type === 'jsonb') return 'unknown';
  return '?' + c.type;
};
{
  let n = 0;
  for (const t of Object.values(schema.tables)) {
    const name = singular(t.name); const it = interfaces[name];
    if (!it) { bad(`table ${t.name}: missing interface ${name} in rows.ts`); continue; }
    const tsF = new Map(it.fields.map((f) => [f.name, f.type]));
    let tableOk = true;
    for (const c of t.columns) {
      const ft = tsF.get(c.name);
      if (ft === undefined) { bad(`${name}: missing field "${c.name}"`); tableOk = false; continue; }
      const nullable = /\| null$/.test(ft); const base = ft.replace(/ \| null$/, '');
      if (nullable === c.notNull) { bad(`${name}.${c.name}: nullability differs (SQL ${c.notNull ? 'NOT NULL' : 'nullable'}, TS "${ft}")`); tableOk = false; }
      const expect = TS_FOR(c);
      if (base !== expect) { bad(`${name}.${c.name}: type "${base}" ≠ expected "${expect}"`); tableOk = false; }
    }
    for (const f of it.fields) if (!t.columns.some((c) => c.name === f.name)) { bad(`${name}.${f.name}: no such column in ${t.name}`); tableOk = false; }
    if (tableOk) n++;
  }
  ok(`${n}/${Object.keys(schema.tables).length} row interfaces match their tables exactly (names, nullability, types)`);
}

// ---------------------------------------------------------------- 3 mock data
section('3. mock-data ↔ schema');
const mock = {};
{
  let n = 0;
  for (const t of Object.values(schema.tables)) {
    const f = path.join(ROOT, 'mock-data', t.name.replace(/_/g, '-') + '.json');
    if (!existsSync(f)) { bad(`mock-data/${path.basename(f)} missing`); continue; }
    const rows = JSON.parse(readFileSync(f, 'utf8')); mock[t.name] = rows;
    if (!rows.length) { warn(`${t.name}: no mock rows`); }
    let tOk = true;
    const cols = new Set(t.columns.map((c) => c.name));
    rows.forEach((r, i) => {
      for (const k of Object.keys(r)) if (!cols.has(k)) { bad(`${t.name}[${i}]: unknown field "${k}"`); tOk = false; }
      for (const c of t.columns) {
        if (!(c.name in r)) { bad(`${t.name}[${i}]: missing field "${c.name}"`); tOk = false; continue; }
        if (r[c.name] === null && c.notNull) { bad(`${t.name}[${i}].${c.name} is null but NOT NULL`); tOk = false; }
        const en = schema.enums[c.type];
        if (en && r[c.name] !== null && !en.includes(r[c.name])) { bad(`${t.name}[${i}].${c.name}="${r[c.name]}" not in ${c.type}`); tOk = false; }
        if (c.type === 'numeric' && r[c.name] !== null && !/^-?\d+\.\d{2}$/.test(String(r[c.name]))) { bad(`${t.name}[${i}].${c.name}="${r[c.name]}" not a 2-decimal string`); tOk = false; }
        if (c.type === 'timestamptz' && r[c.name] !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r[c.name])) { bad(`${t.name}[${i}].${c.name}="${r[c.name]}" not ISO-UTC-with-ms`); tOk = false; }
        if (c.type === 'date' && r[c.name] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(r[c.name])) { bad(`${t.name}[${i}].${c.name}="${r[c.name]}" not YYYY-MM-DD`); tOk = false; }
      }
    });
    if (tOk) n++;
  }
  ok(`${n}/${Object.keys(schema.tables).length} mock files have exactly the schema's columns, valid enums and formats`);
  // FK + unique
  let fkBad = 0, uqBad = 0;
  for (const t of Object.values(schema.tables)) {
    const rows = mock[t.name] ?? [];
    for (const c of t.columns) {
      if (c.references && mock[c.references]) { const ids = new Set(mock[c.references].map((r) => r.id)); for (const r of rows) if (r[c.name] !== null && !ids.has(r[c.name])) { fkBad++; bad(`${t.name}.${c.name} → ${c.references}: dangling ${r[c.name]}`); } }
      if (c.pk || c.unique) { const seen = new Set(); for (const r of rows) { if (r[c.name] === null) continue; if (seen.has(r[c.name])) { uqBad++; bad(`${t.name}.${c.name}: duplicate ${r[c.name]}`); } seen.add(r[c.name]); } }
    }
  }
  if (!fkBad) ok('all foreign keys in mock data resolve'); if (!uqBad) ok('primary keys / unique columns are unique in mock data');
  // polymorphic payments
  const srcTable = { COURT_BOOKING: 'court_bookings', MEMBERSHIP: 'memberships', SHOP_ORDER: 'shop_orders', BAR_ORDER: 'bar_orders', INVOICE: 'invoices' };
  let pBad = 0; for (const p of mock.payments ?? []) { const ids = new Set(mock[srcTable[p.source_type]].map((r) => r.id)); if (!ids.has(p.source_id)) { pBad++; bad(`payment ${p.payment_number}: source ${p.source_type}/${p.source_id} not found`); } }
  if (!pBad) ok('payments.source_type/source_id (polymorphic) all resolve');
}

// ---------------------------------------------------------------- 4 endpoints
section('4. API endpoints ↔ types, errors, tables, requirements');
{
  const known = new Set(Object.keys(interfaces));
  const seen = new Set(); let n = 0;
  for (const e of endpoints) {
    const key = `${e.method} ${e.path}`;
    if (seen.has(key)) bad(`duplicate route ${key}`); seen.add(key);
    if (new Set(endpoints.filter((x) => x.id === e.id)).size > 1) bad(`duplicate id ${e.id}`);
    let eOk = true;
    const r = e.res === 'void' ? null : e.res.replace(/^Page<(.+)>$/, '$1').replace(/\[\]$/, '');
    if (r && !known.has(r)) { bad(`${e.id}: response type "${r}" not defined in shared/types`); eOk = false; }
    for (const c of e.errors) if (!ERROR_CODES[c]) { bad(`${e.id}: unknown error code ${c}`); eOk = false; }
    for (const t of e.tables) if (!schema.tables[t]) { bad(`${e.id}: unknown table ${t}`); eOk = false; }
    for (const q of e.reqs) if (!FR.some((f) => f[0] === q)) { bad(`${e.id}: unknown requirement ${q}`); eOk = false; }
    if (!e.reqs.length) { bad(`${e.id}: no requirement referenced`); eOk = false; }
    for (const role of e.roles) if (role !== PUB && !ENUMS.USER_ROLE[roleName(role)]) { bad(`${e.id}: unknown role ${role}`); eOk = false; }
    const allFields = [...e.body, ...e.query, ...e.body.flatMap((b) => b.of ?? [])];
    for (const f of allFields) {
      const m = f.type.match(/enum:(\w+)/); if (m && !ENUMS[m[1]]) { bad(`${e.id}.${f.name}: unknown enum ${m[1]}`); eOk = false; }
      if (!/^[a-z][a-z0-9_]*$/.test(f.name)) { bad(`${e.id}.${f.name}: field names must be snake_case`); eOk = false; }
    }
    if (!MODULE_OWNER[e.module]) { bad(`${e.id}: module ${e.module} has no owner`); eOk = false; }
    if (eOk) n++;
  }
  ok(`${n}/${endpoints.length} endpoints reference only existing types, errors, tables, requirements, roles, enums`);
  const noEp = FR.filter((f) => !endpoints.some((e) => e.reqs.includes(f[0])) && !f[5]?.ui);
  noEp.length ? noEp.forEach((f) => bad(`${f[0]} has no endpoint and is not marked ui:true`)) : ok('every functional requirement is served by an endpoint (or explicitly UI-only)');
  // API-level naming of response fields: collect all field names in shared types: must be snake_case
  const badNames = []; for (const [n2, it] of Object.entries(interfaces)) for (const f of it.fields) if (!/^[a-z][a-z0-9_]*$/.test(f.name)) badNames.push(`${n2}.${f.name}`);
  badNames.length ? badNames.forEach((x) => bad(`non-snake_case field ${x}`)) : ok('all type fields are snake_case');
  // DB tables touched by at least one endpoint
  const touched = new Set(endpoints.flatMap((e) => e.tables));
  for (const t of Object.keys(schema.tables)) if (!touched.has(t)) warn(`table ${t} is not referenced by any endpoint`);
}

// ---------------------------------------------------------------- 5 requirements
section('5. requirements, coverage, user/business mapping');
{
  const ids = [...FR, ...NFR, ...UR, ...BR].map((r) => r[0]); const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  dup.length ? bad(`duplicate requirement ids: ${dup}`) : ok(`${ids.length} requirement ids are unique`);
  const frs = new Set(FR.map((f) => f[0])); let b = 0;
  for (const [id, , , , covers] of UR) for (const c of covers) if (!frs.has(c)) { b++; bad(`${id} covers unknown ${c}`); }
  for (const [id, , , covers] of BR) for (const c of covers) if (!frs.has(c)) { b++; bad(`${id} covers unknown ${c}`); }
  for (const [t, cs] of COVERAGE) for (const c of cs) if (!frs.has(c)) { b++; bad(`coverage "${t}" cites unknown ${c}`); }
  if (!b) ok('all UR / BR / coverage references resolve to real FRs');
  for (const f of FR) if (!MODULES[f[0].split('-')[1]]) bad(`${f[0]}: module prefix unknown`);
  const used = new Set([...UR.flatMap((u) => u[4]), ...BR.flatMap((x) => x[3]), ...COVERAGE.flatMap((c) => c[1])]);
  const orphan = FR.filter((f) => f[1] === 'MUST' && !used.has(f[0])).map((f) => f[0]);
  orphan.length ? warn(`MUST requirements not cited by any UR/BR/coverage row: ${orphan.join(', ')}`) : ok('every MUST FR is reachable from a user story, business need or coverage row');
}

// ---------------------------------------------------------------- 6 settings
section('6. settings keys');
{
  const keys = new Set((mock.club_settings ?? []).map((r) => r.key)); const want = new Set(RULES.SETTING_KEYS);
  const missing = [...want].filter((k) => !keys.has(k)); const extra = [...keys].filter((k) => !want.has(k));
  missing.length || extra.length ? bad(`SETTING_KEYS ≠ seeded club_settings (missing ${missing}, extra ${extra})`) : ok(`SETTING_KEYS (${want.size}) == seeded club_settings keys`);
}

// ---------------------------------------------------------------- 7 naming lint
section('7. database naming conventions');
{
  let v = 0; const e = (m) => { v++; bad(m); };
  for (const t of Object.values(schema.tables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(t.name)) e(`table ${t.name} not snake_case`);
    if (!/(s|staff)$/.test(t.name)) e(`table ${t.name} should be plural`);
    const id = t.columns.find((c) => c.name === 'id'); if (!id || !id.pk || id.type !== 'uuid') e(`${t.name}: PK must be "id uuid"`);
    for (const c of t.columns) {
      if (!/^[a-z][a-z0-9_]*$/.test(c.name)) e(`${t.name}.${c.name} not snake_case`);
      if (c.references && !c.name.endsWith('_id')) e(`${t.name}.${c.name}: FK columns must end with _id`);
      if (c.name.endsWith('_id') && c.name !== 'id' && !c.references && !POLYMORPHIC.includes(t.name + '.' + c.name)) e(`${t.name}.${c.name}: *_id column without REFERENCES (polymorphic ids must be named source_id and documented)`);
      if (c.name.endsWith('_at') && c.type !== 'timestamptz') e(`${t.name}.${c.name}: *_at must be timestamptz`);
      if (c.type === 'numeric' && !/numeric\((12|5),2\)/.test(c.rawType)) e(`${t.name}.${c.name}: numeric must be (12,2) money or (5,2) percent`);
      if (c.type === 'boolean' && !/^(is_|must_)/.test(c.name)) e(`${t.name}.${c.name}: boolean must be is_* / must_*`);
      if (/float|double|real|money/i.test(c.rawType)) e(`${t.name}.${c.name}: floating/money type forbidden`);
    }
    if (t.columns.some((c) => c.name === 'updated_at') !== t.columns.some((c) => c.name === 'updated_at')) e('unreachable');
  }
  // allowed exception list for *_id without REFERENCES
  if (!v) ok('all tables/columns follow the naming & type conventions');
}

// ---------------------------------------------------------------- 8 ownership
section('8. ownership completeness');
{
  let m = 0;
  for (const t of Object.keys(schema.tables)) { if (!TABLE_OWNER[t]) { bad(`table ${t} has no owner`); m++; } if (!TABLE_PURPOSE[t]) { bad(`table ${t} has no purpose text`); m++; } }
  for (const mod of new Set(endpoints.map((e) => e.module))) if (!MODULE_OWNER[mod]) { bad(`module ${mod} has no owner`); m++; }
  if (!m) ok('every table and API module has exactly one owner');
}

// ---------------------------------------------------------------- 9 links
section('9. markdown links');
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { if (['node_modules', '.git'].includes(f)) continue; const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && files.push(p); } };
  walk(ROOT);
  let broken = 0, total = 0;
  for (const f of files) {
    const src = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = m[1]; if (/^(https?:|mailto:|#)/.test(href)) continue;
      total++; const target = path.resolve(path.dirname(f), href.split('#')[0]);
      if (!existsSync(target)) { broken++; bad(`${path.relative(ROOT, f)} → ${href} (not found)`); }
    }
  }
  if (!broken) ok(`${total} relative links in ${files.length} markdown files all resolve`);
}

// ---------------------------------------------------------------- 10 error usage
section('10. error codes');
{
  const used = new Set(endpoints.flatMap((e) => e.errors)); const auto = ['VALIDATION_ERROR', 'AUTH_UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'INTERNAL_ERROR'];
  const unused = Object.keys(ERROR_CODES).filter((c) => !used.has(c) && !auto.includes(c));
  unused.length ? warn(`error codes not used by any endpoint: ${unused.join(', ')}`) : ok('every error code is used by at least one endpoint');
  const statuses = new Set([400, 401, 402, 403, 404, 409, 422, 500]); for (const [k, v] of Object.entries(ERROR_CODES)) if (!statuses.has(v.status)) bad(`${k}: unexpected HTTP status ${v.status}`);
}

// ---------------------------------------------------------------- 11 cross-references
section('11. cross-references (rules, assumptions, ADRs, requirement ids) exist');
{
  const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
  const ruleIds = new Set([...read('docs/business-rules/BUSINESS_RULES.md').matchAll(/^\| (R-[A-Z]+-\d+) \|/gm)].map((m) => m[1]));
  const assumptionIds = new Set([...read('docs/ASSUMPTIONS.md').matchAll(/^\| (A-\d+) \|/gm)].map((m) => m[1]));
  const adrFiles = readdirSync(path.join(ROOT, 'docs/decisions')).map((f) => f.match(/^(ADR-\d+)/)?.[1]).filter(Boolean);
  const reqIds = new Set([...FR, ...NFR, ...UR, ...BR].map((r) => r[0]));
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { if (['node_modules', '.git', 'mock-data'].includes(f)) continue; const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(md|mjs|ts)$/.test(p) && files.push(p); } };
  walk(ROOT);
  let miss = 0;
  const seen = (set, label, id, f) => { if (!set.has(id)) { miss++; bad(`${path.relative(ROOT, f)}: ${label} "${id}" is cited but not defined`); } };
  const adrSet = new Set(adrFiles);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(R-[A-Z]+-\d{2})\b/g)) seen(ruleIds, 'rule', m[1], f);
    for (const m of src.matchAll(/\bA-(\d{2})\b/g)) seen(assumptionIds, 'assumption', 'A-' + m[1], f);
    for (const m of src.matchAll(/\b(ADR-\d{3})\b/g)) seen(adrSet, 'ADR', m[1], f);
    if (!/requirements\.mjs|check-consistency|gen-docs/.test(f)) for (const m of src.matchAll(/\b((?:N?FR|UR|BR)-[A-Z]+-\d{3}|BR-\d{3})\b/g)) seen(reqIds, 'requirement', m[1], f);
  }
  const { ruleRefs } = await import('./api/endpoints.mjs');
  for (const [id, rs] of Object.entries(ruleRefs)) { if (!endpoints.some((e) => e.id === id)) { miss++; bad(`ruleRefs: unknown endpoint ${id}`); } for (const r of rs) seen(ruleIds, 'rule', r, 'tools/api/endpoints.mjs'); }
  if (!miss) ok(`${ruleIds.size} rules, ${assumptionIds.size} assumptions, ${adrSet.size} ADRs, ${reqIds.size} requirements: every citation in ${files.length} files resolves`);
  const unref = [...ruleIds].filter((r) => !Object.values(ruleRefs).flat().includes(r) && !files.some((f) => !f.endsWith('BUSINESS_RULES.md') && readFileSync(f, 'utf8').includes(r)));
  unref.length ? warn(`rules not cited anywhere outside BUSINESS_RULES.md: ${unref.join(', ')}`) : ok('every business rule is cited by an endpoint or document');
}

// ---------------------------------------------------------------- 13 workflows <-> API
section('13. endpoints cited in hand-written docs exist (workflows ↔ APIs)');
{
  const norm = (p) => p.replace(/\{[^}]+\}|:\w+/g, ':p').replace(/\/+$/, '');
  const routes = new Set(endpoints.map((e) => `${e.method} ${norm(e.path)}`));
  const opIds = new Set(endpoints.map((e) => e.id));
  const modules = [...new Set(endpoints.map((e) => e.module))];
  const docs = ['docs/workflows/USER_FLOWS.md', 'docs/integration/INTEGRATION_CHECKLIST.md', 'docs/integration/TEAM_GUIDELINES.md', 'docs/integration/DEFINITION_OF_DONE.md', 'docs/architecture/SYSTEM_ARCHITECTURE.md', 'docs/business-rules/BUSINESS_RULES.md', 'backend/README.md', 'frontend/README.md', 'mock-data/README.md'];
  let missing = 0, checked = 0;
  for (const rel of docs) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    // METHOD /path   (skip things like "GET {SUPABASE_URL}/rest/v1")
    for (const m of src.matchAll(/\b(GET|POST|PATCH|PUT|DELETE) (\/[A-Za-z0-9\-_/:{}]*)/g)) {
      m[2] = m[2].replace(/:$/, '');
      const p = norm(m[2].replace(/\/api\/v1/, '')) || '/';
      if (m[2].startsWith('/api') && !m[2].startsWith('/api/v1')) continue;
      checked++;
      if (!routes.has(`${m[1]} ${p}`)) { missing++; bad(`${rel}: "${m[1]} ${m[2]}" is not an endpoint in the API contract`); }
    }
    // operation ids like bookings.create or bookings.price/create/list
    const FILE_EXT = ['ts', 'tsx', 'js', 'mjs', 'json', 'md', 'sql', 'yaml', 'yml', 'mmd'];
    for (const m of src.matchAll(new RegExp(`\\b(${modules.join('|')})\\.([a-zA-Z]+(?:/[a-zA-Z]+)*)(?![A-Za-z_.*])`, 'g'))) {
      if (FILE_EXT.includes(m[2])) continue;
      for (const [i, name] of m[2].split('/').entries()) {
        const id = `${m[1]}.${name}`; checked++;
        if (!opIds.has(id)) { missing++; bad(`${rel}: operation "${id}" (from "${m[0]}") does not exist`); }
      }
    }
  }
  if (!missing) ok(`${checked} endpoint/operation citations in ${docs.length} documents all exist in tools/api/endpoints.mjs`);
}

// ---------------------------------------------------------------- 14 mock coverage of schema columns
section('14. schema columns never populated by the seed');
{
  const EXPECTED_NULL = {
    // column -> why the seed leaves it empty (documented in mock-data/README.md "Intentionally empty columns")
    'members.photo_url': 'upload feature (FR-MEM-015, NICE)', 'courts.image_url': 'no image hosting in the mock', 'court_bookings.guest_email': 'only public trial bookings carry an email; the seed has none',
  };
  const empty = [];
  for (const t of Object.values(schema.tables)) {
    const rows = mock[t.name] ?? []; if (!rows.length) continue;
    for (const c of t.columns) if (rows.every((r) => r[c.name] === null)) empty.push(`${t.name}.${c.name}`);
  }
  const unexplained = empty.filter((x) => !(x in EXPECTED_NULL));
  const stale = Object.keys(EXPECTED_NULL).filter((k) => EXPECTED_NULL[k] && !empty.includes(k));
  stale.forEach((k) => bad(`${k} is declared intentionally empty but the seed populates it`));
  unexplained.length ? unexplained.forEach((x) => bad(`${x} is never populated by the seed (populate it or list it as intentionally empty)`)) : ok(`every column is populated at least once, except ${empty.length} documented-empty: ${empty.join(', ')}`);
  const nullEmpty = [...new Set(Object.values(schema.tables).filter((t) => !(mock[t.name] ?? []).length).map((t) => t.name))];
  if (nullEmpty.length) bad(`tables without mock rows: ${nullEmpty}`);
}

// ---------------------------------------------------------------- 12 README claims
section('12. numeric claims in README match reality');
{
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const facts = [
    [/(\d+) endpoints across (\d+) API modules/, [endpoints.length, new Set(endpoints.map((e) => e.module)).size], 'endpoints/modules'],
    [/\((\d+) tables, (\d+) enums\)/, [Object.keys(schema.tables).length, Object.keys(schema.enums).length], 'tables/enums'],
    [/\*\*(\d+) functional requirements\*\*/, [FR.length], 'functional requirements'],
    [/(\d+) recorded decisions/, [[...readFileSync(path.join(ROOT, 'docs/ASSUMPTIONS.md'), 'utf8').matchAll(/^\| A-\d+ \|/gm)].length], 'assumptions'],
  ];
  for (const [re, actual, label] of facts) {
    const m = readme.match(re);
    if (!m) { bad(`README: pattern for ${label} not found`); continue; }
    const claimed = m.slice(1).map(Number);
    JSON.stringify(claimed) === JSON.stringify(actual) ? ok(`README ${label}: ${claimed.join(' / ')}`) : bad(`README claims ${label} = ${claimed.join('/')} but actual = ${actual.join('/')}`);
  }
}

console.log(`\n${fails ? `✘ ${fails} check(s) FAILED` : '✔ ALL CONSISTENCY CHECKS PASSED'}${warns ? `  (${warns} warning${warns > 1 ? 's' : ''})` : ''}`);
process.exit(fails ? 1 : 0);
