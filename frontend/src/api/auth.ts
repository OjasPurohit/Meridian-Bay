import type { AuthSession } from '@shared/types/api';
import type { AuthLoginRequest, AuthSignupRequest } from '@shared/types/requests.generated';
import { apiRequest } from './client';

export const login = (body: AuthLoginRequest) => apiRequest<AuthSession>('POST', '/auth/login', body);
export const signup = (body: AuthSignupRequest) => apiRequest<AuthSession>('POST', '/auth/signup', body);
export const me = () => apiRequest<AuthSession>('GET', '/auth/me');
export const logout = () => apiRequest<void>('POST', '/auth/logout');
