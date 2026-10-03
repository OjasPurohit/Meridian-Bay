// Unit tests for database/checksum.mjs — the line-ending independent migration checksum used by
// database/migrate.mjs and backend/scripts/verify-db-connection.ts.   npm run test:migration-checksum
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalMigrationText, migrationChecksum } from '../database/checksum.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = (f) => readFileSync(path.join(root, 'database/migrations', f), 'utf8');
const toLf = (t) => t.replace(/\r\n|\r/g, '\n');
const toCrlf = (t) => toLf(t).replace(/\n/g, '\r\n');
const sha = (t) => createHash('sha256').update(t).digest('hex');

// Checksums recorded in the champions_club database (schema_migrations), computed from the CRLF form of the files.
const RECORDED = {
  '0001_init.sql': 'c140f8b57ae37a5f3499eb90ce82a8dc483c49d1483438fe9dc6b8538974e0b9',
  '0002_security.sql': '7ab37a49cd6e59dde1e33bccd2bf1a634261061746c0f85a4deeb1d0897e4025',
};

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✔', name); };

test('LF, CRLF and mixed line endings of the same migration give the same checksum', () => {
  for (const f of Object.keys(RECORDED)) {
    const lf = toLf(migration(f));
    const mixed = lf.split('\n').map((l, i, all) => (i % 2 && i < all.length - 1 ? l + '\r' : l)).join('\n');
    const lone = lf.replace(/\n/g, '\r'); // old-Mac style
    const expected = migrationChecksum(lf);
    assert.equal(migrationChecksum(toCrlf(lf)), expected, `${f}: CRLF`);
    assert.equal(migrationChecksum(mixed), expected, `${f}: mixed`);
    assert.equal(migrationChecksum(lone), expected, `${f}: CR only`);
  }
  assert.equal(canonicalMigrationText('a\nb\r\nc\rd'), 'a\r\nb\r\nc\r\nd');
});

test('the canonical form is exactly what the stored records were computed from (SHA-256 of the CRLF text)', () => {
  assert.equal(migrationChecksum('x\ny\n'), sha('x\r\ny\r\n'));
});

test('existing migrations 0001 and 0002 match the checksums recorded in champions_club, whatever the file line endings', () => {
  for (const [f, recorded] of Object.entries(RECORDED)) {
    assert.equal(migrationChecksum(migration(f)), recorded, `${f}: as checked out`);
    assert.equal(migrationChecksum(toLf(migration(f))), recorded, `${f}: LF`);
    assert.equal(migrationChecksum(toCrlf(migration(f))), recorded, `${f}: CRLF`);
  }
});

test('a genuine content change still changes the checksum (any line ending)', () => {
  for (const [f, recorded] of Object.entries(RECORDED)) {
    const sql = migration(f);
    for (const variant of [toLf, toCrlf]) {
      assert.notEqual(migrationChecksum(variant(sql) + '-- tamper\n'), recorded, `${f}: appended comment`);
      assert.notEqual(migrationChecksum(variant(sql).replace(/\b(ALTER|CREATE)\b/, '$1x')), recorded, `${f}: edited statement`);
      assert.notEqual(migrationChecksum(variant(sql).replace(/ /, '  ')), recorded, `${f}: whitespace inside a line is content`);
    }
  }
});

console.log(`\n${n} migration-checksum tests passed`);
