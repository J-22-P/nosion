import type {
  AuthUserDto,
  LoginInput,
  LoginResponse,
  ModuleKey,
  RegisterInput,
  UpdateSettingsInput,
} from '@nosion/contracts';
import { apiFetch } from '@/lib/api-client';

export interface MeResponse {
  user: AuthUserDto;
  settings: {
    timezone: string;
    locale: string;
    buddhistEra: boolean;
    currency: string;
    weekStartsOn: number;
    theme: string;
    enabledModules: ModuleKey[];
    focusGoalMinutes: number;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    dailyDigestEnabled: boolean;
    dailyDigestTime: string;
    [key: string]: unknown;
  };
}

export const authApi = {
  login: (input: LoginInput) =>
    apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: input, anonymous: true }),

  register: (input: RegisterInput) =>
    apiFetch<LoginResponse>('/auth/register', { method: 'POST', body: input, anonymous: true }),

  demo: () => apiFetch<LoginResponse>('/auth/demo', { method: 'POST', anonymous: true }),

  refresh: () =>
    apiFetch<{ accessToken: string; expiresIn: number }>('/auth/refresh', {
      method: 'POST',
      anonymous: true,
    }),

  me: () => apiFetch<MeResponse>('/me'),

  updateSettings: (input: UpdateSettingsInput) =>
    apiFetch<MeResponse['settings']>('/me/settings', { method: 'PATCH', body: input }),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
};
