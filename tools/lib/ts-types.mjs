// Tiny TypeScript-interface reader for shared/types/*.ts (our own restricted style: one field per `;`).
// Good enough for: consistency checks (interface fields vs table columns) and OpenAPI component schemas.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './schema.mjs';
import * as ENUMS from '../../shared/constants/enums.ts';

export const readShared = (rel) => readFileSync(path.join(ROOT, 'shared', rel), 'utf8');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
}

function matchBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced braces');
}

function splitFields(body) {
  const parts = []; let depth = 0; let cur = '';
  for (const ch of body) {
    if ('{[(<'.includes(ch)) depth++;
    if ('}])>'.includes(ch) && !(ch === '>' && cur.endsWith('='))) depth--;
    if ((ch === ';' || ch === ',') && depth === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function parseFields(body) {
  return splitFields(body).map((p) => {
    const m = p.match(/^(\w+)(\?)?:\s*([\s\S]+)$/);
    if (!m) return null;
    return { name: m[1], optional: !!m[2], type: m[3].replace(/\s+/g, ' ').trim() };
  }).filter(Boolean);
}

/** -> { Name: { extends: [..], fields: [{name, optional, type}] } } and aliases { Name: typeString } */
export function parseTypes(files) {
  const interfaces = {}; const aliases = {};
  for (const rel of files) {
    const src = stripComments(readShared(rel));
    const re = /export interface (\w+)(?:<[^>]*>)?(?: extends ([\w, ]+))? \{/g;
    let m;
    while ((m = re.exec(src))) {
      const open = src.indexOf('{', m.index + m[0].length - 1);
      const close = matchBrace(src, open);
      interfaces[m[1]] = { extends: m[2] ? m[2].split(',').map((s) => s.trim()) : [], fields: parseFields(src.slice(open + 1, close)), file: rel };
    }
    for (const a of src.matchAll(/export type (\w+)(?:<[^>]*>)? = ([^;]+);/g)) aliases[a[1]] = a[2].replace(/\s+/g, ' ').trim();
  }
  return { interfaces, aliases };
}

export const enumConstFromType = (typeName) => typeName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase(); // UserRole -> USER_ROLE
export const pascal = (s) => s.split(/[._\-\s]+/).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

const SCALARS = {
  Uuid: { type: 'string', format: 'uuid' },
  Money: { type: 'string', pattern: '^\\d+\\.\\d{2}$', example: '1250.00' },
  Percent: { type: 'string', pattern: '^\\d+\\.\\d{2}$', example: '18.00' },
  IsoDateTime: { type: 'string', format: 'date-time' },
  IsoDate: { type: 'string', format: 'date' },
  TimeOfDay: { type: 'string', pattern: '^\\d{2}:\\d{2}:\\d{2}$', example: '18:00:00' },
  string: { type: 'string' }, number: { type: 'number' }, boolean: { type: 'boolean' }, unknown: {},
};

/** Convert a TS type string to an OpenAPI 3.0 schema. `known` = set of interface names (-> $ref). */
export function tsToSchema(typeStr, known, aliases = {}) {
  let t = typeStr.trim();
  if (t.endsWith('| null')) return { ...tsToSchema(t.slice(0, -6), known, aliases), nullable: true };
  if (/^\(.*\)\[\]$/.test(t) || /\}\[\]$/.test(t)) return { type: 'array', items: tsToSchema(t.slice(0, -2).replace(/^\((.*)\)$/, '$1'), known, aliases) };
  if (t.endsWith('[]')) return { type: 'array', items: tsToSchema(t.slice(0, -2), known, aliases) };
  if (SCALARS[t]) return { ...SCALARS[t] };
  let m = t.match(/^E\.(\w+)$/);
  if (m) { const c = ENUMS[enumConstFromType(m[1])]; return c ? { type: 'string', enum: Object.values(c) } : {}; }
  m = t.match(/^Record<([^,]+), (.+)>$/);
  if (m) return { type: 'object', additionalProperties: tsToSchema(m[2], known, aliases) };
  m = t.match(/^'([^']+)'$/);
  if (m) return { type: 'string', enum: [m[1]] };
  if (t.startsWith('{') && t.endsWith('}')) {
    const fields = parseFields(t.slice(1, -1));
    return { type: 'object', properties: Object.fromEntries(fields.map((f) => [f.name, tsToSchema(f.type, known, aliases)])), required: fields.filter((f) => !f.optional).map((f) => f.name) };
  }
  if (known.has(t)) return { $ref: `#/components/schemas/${t}` };
  if (aliases[t]) return tsToSchema(aliases[t], known, aliases);
  return { description: `TS: ${t}` };
}

// ---------------------------------------------------------------------------------- sample generation (for generated API examples)
/** table name -> row interface name, using the same singularisation rule as the consistency checker. */
export const interfaceForTable = (t) => {
  const w = t.split('_'); const last = w.pop();
  const s = last === 'staff' ? 'staff' : last.endsWith('ies') ? last.slice(0, -3) + 'y' : last.endsWith('s') ? last.slice(0, -1) : last;
  return [...w, s].map((x) => x[0].toUpperCase() + x.slice(1)).join('');
};

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export const sampleUuid = (seed) => `${(hash(seed) % 0xffffff).toString(16).padStart(8, '0')}-0000-4000-8000-${String(hash(seed + 'x') % 1e12).padStart(12, '0')}`;
const STRING_HINTS = [[/email/, 'name@example.com'], [/phone/, '+919811100001'], [/(^|_)name$|^label$/, 'Aarav Kapoor'], [/_code$/, 'CCM-00001'], [/_number$/, 'BK-000001'], [/^sku$/, 'RKT-WIL-CLASH100'], [/address/, '12, Lake View Residency, Baner, Pune 411045'], [/^token$/, 'eyJhbGciOiJIUzI1NiIs…'], [/redirect_to/, '/member'], [/url$/, 'https://example.com/image.jpg'], [/^key$/, 'club_name'], [/title/, 'Friday Social Doubles'], [/reason|note|message|description/, 'Sample text'], [/entity_type/, 'court_bookings']];

/**
 * Build a realistic sample object for a response type. Row interfaces use the first mock-data row; view types are
 * composed from their parents plus type-driven values for the extra fields.
 */
export function makeSampler({ interfaces, aliases, enums, mockRow, idFor = () => null }) {
  const tableOf = {}; // iface -> table
  const sampleType = (type, field, depth, ctx = '') => {
    let t = type.trim();
    if (t.endsWith('| null')) t = t.slice(0, -6).trim();
    if (t.endsWith('[]')) return depth > 3 ? [] : [sampleType(t.slice(0, -2).replace(/^\((.*)\)$/, '$1'), field, depth + 1, ctx)];
    const rec = t.match(/^Record<E\.(\w+), (.+)>$/);
    if (rec) return Object.fromEntries(Object.values(enums[enumConstFromType(rec[1])] ?? {}).map((v) => [v, 0]));
    if (t === 'Money') return '1250.00';
    if (t === 'Percent') return /discount|tax/.test(field) ? '15.00' : '18.00';
    if (t === 'IsoDateTime') return '2026-10-03T12:30:00.000Z';
    if (t === 'IsoDate') return '2026-10-03';
    if (t === 'TimeOfDay') return '18:00:00';
    if (t === 'Uuid') return idFor(field) ?? sampleUuid(field);
    if (t === 'boolean') return true;
    if (t === 'number') return /percent/.test(field) ? 62 : 3;
    if (t === 'string') {
      if (field === 'name' || field === 'item_name' || field === 'product_name') return /Product|Inventory|ShopOrder/.test(ctx) ? 'Wilson Clash 100 v2 Tennis Racket' : /Court/.test(ctx) ? 'Tennis Court 1' : /Plan|Membership/.test(ctx) ? 'Gold Membership' : /Menu/.test(ctx) ? 'Cold Coffee' : /Enquiry|Quote/.test(ctx) ? 'Siddharth Rao' : 'Aarav Kapoor';
      return (STRING_HINTS.find(([re]) => re.test(field)) ?? [, 'string'])[1];
    }
    if (t === 'unknown') return 'value';
    const e = t.match(/^E\.(\w+)$/);
    if (e) return Object.values(enums[enumConstFromType(e[1])] ?? {})[0] ?? 'VALUE';
    if (t.startsWith('{') && t.endsWith('}')) return Object.fromEntries(parseFields(t.slice(1, -1)).map((f) => [f.name, sampleType(f.type, f.name, depth + 1, ctx)]));
    if (interfaces[t]) return depth > 3 ? {} : sampleInterface(t, depth + 1);
    if (aliases[t]) {
      const om = aliases[t].match(/^Omit<(\w+), '([^']+)'>$/);
      if (om) { const o = { ...sampleInterface(om[1], depth + 1) }; delete o[om[2]]; return o; }
      return sampleType(aliases[t], field, depth);
    }
    return 'unknown';
  };
  function sampleInterface(name, depth = 0) {
    const it = interfaces[name]; if (!it) return {};
    let base = {};
    for (const p of it.extends) Object.assign(base, sampleInterface(p, depth));
    const row = tableOf[name] ? mockRow(tableOf[name]) : null;
    if (row) base = { ...base, ...row };
    for (const f of it.fields) if (!(f.name in base)) base[f.name] = sampleType(f.type, f.name, depth, name);
    return base;
  }
  return { sampleInterface, sampleType, register: (iface, table) => { tableOf[iface] = table; } };
}
