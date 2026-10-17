import type { OAuthProvider } from '@nosion/contracts';
import { createHash, randomBytes } from 'node:crypto';

/**
 * ผู้ให้บริการ OAuth 2.0 (Authorization Code + PKCE) — Google (OpenID Connect) และ GitHub (OAuth App)
 * ไฟล์นี้รู้แค่ "URL ไหน ส่งอะไร ได้อะไรกลับ" · การตัดสินว่าใครเป็นใคร/ผูกบัญชีไหนอยู่ใน oauth.service.ts
 */

export interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

/** โปรไฟล์ที่ทำให้เป็นรูปเดียวกันทุกผู้ให้บริการ */
export interface OAuthProfile {
  providerUserId: string;
  /** null = ผู้ให้บริการไม่บอกอีเมลที่ยืนยันแล้ว */
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  /** ชื่อที่ผู้ใช้จำได้ในหน้าตั้งค่า (อีเมล Google · username GitHub) */
  login: string;
  accessToken: string;
  /** scope ที่ได้รับจริง (ผู้ใช้อาจไม่อนุญาตครบตามที่ขอ) */
  scopes: string[];
}

export class OAuthExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthExchangeError';
  }
}

/**
 * scope ที่ขอ — ขอเท่าที่ใช้ (least privilege)
 * GitHub: เข้าสู่ระบบ = อ่านโปรไฟล์/อีเมล · ดึง issue ของ repo ส่วนตัว = ต้องขอ `repo` เพิ่ม (ผู้ใช้เลือกเองในหน้าตั้งค่า)
 * — OAuth App ของ GitHub ไม่มี scope "อ่านอย่างเดียว" ของ repo ส่วนตัว
 */
export const BASE_SCOPES: Record<OAuthProvider, string[]> = {
  google: ['openid', 'email', 'profile'],
  github: ['read:user', 'user:email'],
};
export const GITHUB_PRIVATE_REPO_SCOPE = 'repo';

/** PKCE (RFC 7636) — code ที่ถูกดักกลางทางเอาไปแลก token ไม่ได้ถ้าไม่มี verifier ที่อยู่ในคุกกี้ของเรา */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizationUrl(
  provider: OAuthProvider,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    challenge: string;
    scopes: string[];
  },
): string {
  const common = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    scope: params.scopes.join(' '),
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
  };
  if (provider === 'google') {
    const q = new URLSearchParams({ ...common, response_type: 'code', prompt: 'select_account' });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({ ...common, allow_signup: 'true' });
  return `https://github.com/login/oauth/authorize?${q}`;
}

/** แลก code เป็น token แล้วอ่านโปรไฟล์ */
export async function fetchProfile(
  provider: OAuthProvider,
  creds: ProviderCredentials,
  params: { code: string; verifier: string; redirectUri: string },
): Promise<OAuthProfile> {
  return provider === 'google' ? googleProfile(creds, params) : githubProfile(creds, params);
}

async function googleProfile(
  creds: ProviderCredentials,
  params: { code: string; verifier: string; redirectUri: string },
): Promise<OAuthProfile> {
  const token = await postForm<{ access_token?: string; scope?: string; error?: string }>(
    'https://oauth2.googleapis.com/token',
    {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code: params.code,
      code_verifier: params.verifier,
      grant_type: 'authorization_code',
      redirect_uri: params.redirectUri,
    },
  );
  if (!token.access_token) throw new OAuthExchangeError(`google token: ${token.error ?? 'ไม่มี'}`);

  const info = await getJson<{
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  }>('https://openidconnect.googleapis.com/v1/userinfo', token.access_token);

  const email = info.email?.toLowerCase() ?? null;
  return {
    providerUserId: info.sub,
    email,
    emailVerified: info.email_verified === true,
    displayName: info.name?.trim() || email?.split('@')[0] || 'ผู้ใช้ Google',
    avatarUrl: info.picture ?? null,
    login: email ?? info.sub,
    accessToken: token.access_token,
    scopes: (token.scope ?? '').split(' ').filter(Boolean),
  };
}

async function githubProfile(
  creds: ProviderCredentials,
  params: { code: string; verifier: string; redirectUri: string },
): Promise<OAuthProfile> {
  const token = await postForm<{ access_token?: string; scope?: string; error?: string }>(
    'https://github.com/login/oauth/access_token',
    {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code: params.code,
      code_verifier: params.verifier,
      redirect_uri: params.redirectUri,
    },
  );
  // GitHub ตอบ 200 แม้ code ผิด — error อยู่ใน body
  if (!token.access_token) throw new OAuthExchangeError(`github token: ${token.error ?? 'ไม่มี'}`);

  const [user, emails] = await Promise.all([
    getJson<{ id: number; login: string; name: string | null; avatar_url: string | null }>(
      'https://api.github.com/user',
      token.access_token,
    ),
    getJson<Array<{ email: string; primary: boolean; verified: boolean }>>(
      'https://api.github.com/user/emails',
      token.access_token,
    ),
  ]);

  // อีเมลหลักที่ยืนยันแล้วเท่านั้น — อีเมลที่ยังไม่ยืนยันบน GitHub ใครก็พิมพ์ใส่ได้
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  return {
    providerUserId: String(user.id),
    email: primary?.email.toLowerCase() ?? null,
    emailVerified: Boolean(primary),
    displayName: user.name?.trim() || user.login,
    avatarUrl: user.avatar_url,
    login: user.login,
    accessToken: token.access_token,
    // GitHub คั่น scope ด้วยจุลภาค
    scopes: (token.scope ?? '').split(/[ ,]/).filter(Boolean),
  };
}

const GITHUB_HEADERS = {
  'User-Agent': 'NOSION',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function postForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...GITHUB_HEADERS,
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(8_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new OAuthExchangeError(`${url} ตอบ ${res.status} ${json.error ?? ''}`);
  return json;
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...GITHUB_HEADERS,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new OAuthExchangeError(`${url} ตอบ ${res.status}`);
  return (await res.json()) as T;
}
