// Validates docs/api/openapi.yaml against the OpenAPI 3.0 specification (and resolves every $ref).
import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'node:path';
import { ROOT } from './lib/schema.mjs';
try {
  const api = await SwaggerParser.validate(path.join(ROOT, 'docs/api/openapi.yaml'));
  const ops = Object.values(api.paths).flatMap((p) => Object.values(p)).length;
  console.log(`✔ openapi.yaml is a valid OpenAPI ${api.openapi} document: ${Object.keys(api.paths).length} paths, ${ops} operations, ${Object.keys(api.components.schemas).length} schemas`);
} catch (e) { console.error('✘ openapi.yaml INVALID:', e.message); process.exit(1); }
