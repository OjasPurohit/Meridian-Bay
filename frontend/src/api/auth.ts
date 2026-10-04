import type { AuthSession, EmployeeApplicationPending, LoginResult } from '@shared/types/api';
import type { AuthLoginRequest, AuthSignupRequest, StaffApplicationCreateRequest } from '@shared/types/requests.generated';
import { apiRequest } from './client';

export const login = (body: AuthLoginRequest) => apiRequest<LoginResult>('POST', '/auth/login', body);
export const applyAsEmployee = (body: StaffApplicationCreateRequest) => apiRequest<EmployeeApplicationPending>('POST', '/staff/applications', body);
export const signup = (body: AuthSignupRequest) => apiRequest<AuthSession>('POST', '/auth/signup', body);
export const me = () => apiRequest<AuthSession>('GET', '/auth/me');
export const logout = () => apiRequest<void>('POST', '/auth/logout');
