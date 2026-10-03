/**
 * zod schemas for the clients module. Each mirrors a generated type in shared/types/requests.generated.ts
 * (the `Schema<…>` annotations make the compiler flag drift). Field rules not spelled out in the contract
 * (lengths, GSTIN / phone / password shape) follow the contract's own wording: "15-char GSTIN", phone "E.164 or
 * 10-digit", password "min 8 chars, >=1 letter and >=1 digit" (R-SEC-02).
 */
import type { ClientsCreateRequest, ClientsListQuery, ClientsUpdateRequest } from '@shared/types/requests.generated';
import { paginationFields, queryBool, strictObject, z, type PaginationQuery, type Schema } from '../../kernel/validate';

const text = (max: number) => z.string().trim().min(1, 'Must not be empty.').max(max, `At most ${max} characters.`);
const name = text(200);
const email = z.string().trim().toLowerCase().email('Must be a valid email address.').max(254);
const phone = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number: E.164 (+919820000006) or 10 digits.');
const gstin = z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, 'Must be a 15-character GSTIN.');
const longText = text(2000);

const password = z
  .string()
  .min(8, 'Must be at least 8 characters.')
  .refine((v) => /[A-Za-z]/.test(v), 'Must contain at least one letter.')
  .refine((v) => /\d/.test(v), 'Must contain at least one digit.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Must be at most 72 bytes (bcrypt limit).');

// ------------------------------------------------------------------ POST /business-clients
export const createClientBody: Schema<ClientsCreateRequest> = strictObject({
  company_name: name,
  contact_name: name,
  email,
  phone: phone.optional(),
  gstin: gstin.optional(),
  billing_address: longText.optional(),
  notes: longText.optional(),
  create_login: z.boolean().optional(),
  initial_password: password.optional(),
}).superRefine((body, ctx) => {
  if (body.create_login === true && body.initial_password === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initial_password'], message: 'Required when create_login is true.' });
  }
  if (body.create_login !== true && body.initial_password !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['initial_password'], message: 'Only allowed when create_login is true.' });
  }
});

// ------------------------------------------------------------------ PATCH /business-clients/:id
/** The generated type has no `null`, but API_CONTRACT §1 says "sending null clears nullable fields on PATCH". */
const NULLABLE = ['phone', 'gstin', 'billing_address', 'notes'] as const;
export type ClientsUpdateInput = Omit<ClientsUpdateRequest, (typeof NULLABLE)[number]> & {
  [K in (typeof NULLABLE)[number]]?: string | null;
};

export const updateClientBody: Schema<ClientsUpdateInput> = strictObject({
  company_name: name.optional(),
  contact_name: name.optional(),
  email: email.optional(),
  phone: phone.nullable().optional(),
  gstin: gstin.nullable().optional(),
  billing_address: longText.nullable().optional(),
  notes: longText.nullable().optional(),
  is_active: z.boolean().optional(),
});

// ------------------------------------------------------------------ GET /business-clients
export type ClientsListInput = ClientsListQuery & PaginationQuery;

export const listClientsQuery: Schema<ClientsListInput> = z.object({
  q: z.string().trim().max(100).optional(),
  is_active: queryBool.optional(),
  ...paginationFields,
});
