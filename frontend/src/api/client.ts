import type { ApiResponse } from '@shared/types/api';

/**
 * Fetch wrapper for the /api/v1 contract (docs/api/API_CONTRACT.md). The base URL comes from VITE_API_BASE_URL;
 * when it is unset there is no backend to talk to and every call fails with BACKEND_UNAVAILABLE — nothing is faked.
 */
const BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');

export const isBackendConfigured = BASE.length > 0;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Dispatched on `window` when the server says the session is over (expired token, deactivated account). */
export const SESSION_ENDED_EVENT = 'auth:session-ended';

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

export async function apiRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (!isBackendConfigured) {
    throw new ApiError('BACKEND_UNAVAILABLE', 'Accounts aren’t connected yet — the club’s sign-in service is still being built.');
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'We couldn’t reach the club’s servers. Check your connection and try again.');
  }
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError('BAD_RESPONSE', 'The server sent an unexpected response.', res.status);
  if (!json.success) throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
  return json.data;
}
