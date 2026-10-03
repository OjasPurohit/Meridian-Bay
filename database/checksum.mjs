// The ONE definition of a migration checksum, shared by database/migrate.mjs, backend/scripts/verify-db-connection.ts
// and the tests. SHA-256 over the file text with every line ending normalised to CRLF ("\r\n").
//
// Why: the same migration file is LF on one machine and CRLF on another (git autocrlf / editors), and a checksum that
// depends on that would reject an unmodified migration. Why CRLF and not LF: the checksums already recorded in existing
// databases (schema_migrations) were computed from CRLF files, so CRLF is the canonical form that keeps every existing
// record valid. Only a real change of the SQL text changes the checksum.
import { createHash } from 'node:crypto';

export function canonicalMigrationText(text) {
  return text.replace(/\r\n|\r|\n/g, '\r\n');
}

export function migrationChecksum(text) {
  return createHash('sha256').update(canonicalMigrationText(text)).digest('hex');
}
