import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import {
  createTestApp,
  registerAndLogin,
  resetRateLimits,
  STRONG_PASSWORD,
  uniqueEmail,
} from './helpers';

/**
 * Google / GitHub ตัวจริงเรียกจากเทสต์ไม่ได้ — ปลอมที่ fetch (ชั้นนอกสุดของ API)
 * ทุกอย่างข้างในวิ่งจริง: state cookie ที่เข้ารหัส · PKCE · จับคู่บัญชี · ออก session · DB
 */
interface FakeAccount {
  provider: 'google' | 'github';
  id: string;
  email: string | null;
  verified: boolean;
  name: string;
  login?: string;
  scope?: string;
}

let fake: FakeAccount;
let lastTokenRequest: URLSearchParams | null = null;
let issuesFetched = 0;
const realFetch = globalThis.fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('oauth2.googleapis.com/token') || url.includes('github.com/login/oauth')) {
    lastTokenRequest = new URLSearchParams(String(init?.body));
    if (lastTokenRequest.get('code') === 'bad-code') {
      return Promise.resolve(json({ error: 'bad_verification_code' }));
    }
    if (lastTokenRequest.get('code') === 'wrong-secret') {
      return Promise.resolve(json({ error: 'incorrect_client_credentials' }));
    }
    return Promise.resolve(
      json({ access_token: `tok-${fake.id}`, scope: fake.scope ?? 'read:user,user:email' }),
    );
  }
  if (url.includes('openidconnect.googleapis.com')) {
    return Promise.resolve(
      json({ sub: fake.id, email: fake.email, email_verified: fake.verified, name: fake.name }),
    );
  }
  if (url.endsWith('api.github.com/user')) {
    return Promise.resolve(
      json({ id: Number(fake.id), login: fake.login ?? 'octo', name: fake.name, avatar_url: null }),
    );
  }
  if (url.includes('api.github.com/issues')) {
    issuesFetched++;
    return Promise.resolve(json([]));
  }
  if (url.endsWith('api.github.com/user/emails')) {
    return Promise.resolve(
      json(fake.email ? [{ email: fake.email, primary: true, verified: fake.verified }] : []),
    );
  }
  return realFetch(input, init);
}

describe('OAuth: Google / GitHub (Phase 8 ขั้น 4b)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const saved: Record<string, string | undefined> = {};
  const ENV = {
    GOOGLE_CLIENT_ID: 'google-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GITHUB_CLIENT_ID: 'github-id',
    GITHUB_CLIENT_SECRET: 'github-secret',
    APP_URL: 'http://web.test',
    API_URL: 'http://web.test',
  };

  beforeAll(async () => {
    for (const [k, v] of Object.entries(ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
    vi.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const api = () => request(app.getHttpServer());

  /** เริ่ม flow → ได้คุกกี้ state + URL ของผู้ให้บริการ */
  async function begin(provider: 'google' | 'github', query = '') {
    const res = await api().get(`/api/v1/auth/oauth/${provider}${query}`).expect(302);
    const location = new URL(res.headers.location as string);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('nosion_oauth='),
    )!;
    return { location, cookie: cookie.split(';')[0]!, rawCookie: cookie };
  }

  /** กลับจากผู้ให้บริการพร้อม code */
  async function callback(
    provider: 'google' | 'github',
    started: { location: URL; cookie: string },
    code = 'good-code',
  ) {
    const state = started.location.searchParams.get('state')!;
    return api()
      .get(`/api/v1/auth/oauth/${provider}/callback?code=${code}&state=${state}`)
      .set('Cookie', started.cookie)
      .expect(302);
  }

  function refreshCookie(res: request.Response): string | undefined {
    return (res.headers['set-cookie'] as unknown as string[] | undefined)
      ?.find((c) => c.startsWith('nosion_rt='))
      ?.split(';')[0];
  }

  it('บอกว่าผู้ให้บริการไหนเปิดอยู่', async () => {
    const res = await api().get('/api/v1/auth/oauth/providers').expect(200);
    expect(res.body).toEqual({ google: true, github: true });
  });

  it('เริ่ม flow: ไปหน้า Google พร้อม state + PKCE S256 · คุกกี้ state เป็น HttpOnly SameSite=Lax ที่อ่านไม่ออก', async () => {
    const { location, rawCookie } = await begin('google', '?tz=Asia/Tokyo');
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://web.test/api/v1/auth/oauth/google/callback',
    );
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('scope')).toBe('openid email profile');
    expect(rawCookie).toMatch(/HttpOnly/i);
    expect(rawCookie).toMatch(/SameSite=Lax/i);
    expect(rawCookie).not.toContain(location.searchParams.get('state')!);
  });

  it('Google ครั้งแรก → สร้างผู้ใช้ใหม่ (อีเมลยืนยันแล้ว · ไม่มีรหัสผ่าน · โซนจากเบราว์เซอร์) → ได้ refresh cookie → /today', async () => {
    const email = uniqueEmail('g-new');
    fake = { provider: 'google', id: 'g-1001', email, verified: true, name: 'คุณกูเกิล' };
    const started = await begin('google', '?tz=Asia/Tokyo');
    const res = await callback('google', started);

    expect(res.headers.location).toBe('http://web.test/today');
    const rt = refreshCookie(res);
    expect(rt).toBeTruthy();
    // PKCE: verifier ที่ส่งไปแลก token ต้องตรงกับ challenge ที่ส่งไปตอนแรก
    expect(lastTokenRequest?.get('code_verifier')).toBeTruthy();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { settings: true, oauthAccounts: true },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerified).not.toBeNull();
    expect(user.displayName).toBe('คุณกูเกิล');
    expect(user.settings?.timezone).toBe('Asia/Tokyo');
    expect(user.oauthAccounts).toHaveLength(1);
    // Google ใช้แค่ยืนยันตัวตน — ไม่เก็บ token
    expect(user.oauthAccounts[0]!.accessTokenEnc).toBeNull();

    // refresh cookie ใช้ได้จริง
    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', rt!).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    // ครั้งที่สอง → ผู้ใช้คนเดิม ไม่สร้างซ้ำ
    const again = await callback('google', await begin('google'));
    expect(again.headers.location).toBe('http://web.test/today');
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('อีเมลตรงกับบัญชีที่ยืนยันแล้ว → ผูกอัตโนมัติ · ตรงกับบัญชีที่ยังไม่ยืนยัน → ไม่ผูก (กันยึดบัญชี)', async () => {
    const verifiedEmail = uniqueEmail('g-verified');
    await api()
      .post('/api/v1/auth/register')
      .send({ email: verifiedEmail, password: STRONG_PASSWORD, displayName: 'มีรหัสผ่าน' })
      .expect(201);
    await prisma.user.update({
      where: { email: verifiedEmail },
      data: { emailVerified: new Date() },
    });

    fake = { provider: 'google', id: 'g-2002', email: verifiedEmail, verified: true, name: 'x' };
    const linked = await callback('google', await begin('google'));
    expect(linked.headers.location).toBe('http://web.test/today');
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: verifiedEmail },
      include: { oauthAccounts: true },
    });
    expect(owner.oauthAccounts.map((a) => a.provider)).toEqual(['google']);
    expect(owner.passwordHash).not.toBeNull();

    const unverifiedEmail = uniqueEmail('g-unverified');
    await api()
      .post('/api/v1/auth/register')
      .send({ email: unverifiedEmail, password: STRONG_PASSWORD, displayName: 'ผู้ร้าย' })
      .expect(201);
    fake = { provider: 'google', id: 'g-3003', email: unverifiedEmail, verified: true, name: 'x' };
    const blocked = await callback('google', await begin('google'));
    expect(blocked.headers.location).toBe('http://web.test/login?oauth_error=email_conflict');
    expect(refreshCookie(blocked)).toBeUndefined();
  });

  it('ผู้ให้บริการบอกว่าอีเมลยังไม่ยืนยัน → ไม่สร้างบัญชี', async () => {
    fake = { provider: 'github', id: '4004', email: uniqueEmail('gh'), verified: false, name: 'x' };
    const res = await callback('github', await begin('github'));
    expect(res.headers.location).toBe('http://web.test/login?oauth_error=email_unverified');
  });

  it('state ไม่ตรง / ไม่มีคุกกี้ / ผู้ใช้กดยกเลิก / code ผิด → กลับหน้า login พร้อมรหัสข้อผิดพลาด', async () => {
    fake = { provider: 'google', id: 'g-5005', email: uniqueEmail('g'), verified: true, name: 'x' };
    const started = await begin('google');

    const forged = await api()
      .get('/api/v1/auth/oauth/google/callback?code=good-code&state=attacker-state')
      .set('Cookie', started.cookie)
      .expect(302);
    expect(forged.headers.location).toContain('oauth_error=state_mismatch');

    const noCookie = await api()
      .get(
        `/api/v1/auth/oauth/google/callback?code=good-code&state=${started.location.searchParams.get('state')}`,
      )
      .expect(302);
    expect(noCookie.headers.location).toContain('oauth_error=state_mismatch');

    const state = started.location.searchParams.get('state')!;
    const denied = await api()
      .get(`/api/v1/auth/oauth/google/callback?error=access_denied&state=${state}`)
      .set('Cookie', started.cookie)
      .expect(302);
    expect(denied.headers.location).toContain('oauth_error=denied');

    const bad = await callback('google', await begin('google'), 'bad-code');
    expect(bad.headers.location).toContain('oauth_error=exchange_failed');
    expect(bad.headers.location).toContain('oauth_reason=bad_verification_code');

    // client secret ผิดบนเซิร์ฟเวอร์ — บอกให้ชัดว่าเป็นปัญหาการตั้งค่า ไม่ใช่ "ลองใหม่"
    const misconfigured = await callback('github', await begin('github'), 'wrong-secret');
    expect(misconfigured.headers.location).toBe(
      'http://web.test/login?oauth_error=provider_misconfigured&oauth_reason=incorrect_client_credentials',
    );
  });

  it('ผูก GitHub จากหน้าตั้งค่า (ขอ repo ส่วนตัว) → เก็บ token แบบเข้ารหัส · ยกเลิกการเชื่อมได้', async () => {
    const token = await registerAndLogin(app, 'gh-link');
    const link = await api()
      .post('/api/v1/auth/oauth/github/link')
      .set('Authorization', `Bearer ${token}`)
      .send({ includePrivateRepos: true })
      .expect(200);
    const linkUrl = new URL(link.body.url as string);
    expect(linkUrl.pathname).toBe('/api/v1/auth/oauth/github');

    const started = await begin('github', linkUrl.search);
    expect(started.location.origin).toBe('https://github.com');
    expect(started.location.searchParams.get('scope')).toBe('read:user user:email repo');

    fake = {
      provider: 'github',
      id: '6006',
      email: uniqueEmail('gh-other-email'),
      verified: true,
      name: 'Octo Cat',
      login: 'octocat',
      scope: 'read:user,repo,user:email',
    };
    const fetchedBefore = issuesFetched;
    const res = await callback('github', started);
    expect(res.headers.location).toBe('http://web.test/settings?connected=github');
    // เชื่อมแล้วดึง issue รอบแรกทันที (integrations/github ฟัง event)
    expect(issuesFetched).toBe(fetchedBefore + 1);
    // ผูกบัญชีไม่ได้ออก session ใหม่
    expect(refreshCookie(res)).toBeUndefined();

    const accounts = await api()
      .get('/api/v1/me/oauth-accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(accounts.body).toMatchObject({
      hasPassword: true,
      accounts: [
        { provider: 'github', login: 'octocat', scopes: ['read:user', 'repo', 'user:email'] },
      ],
    });

    const row = await prisma.oAuthAccount.findFirstOrThrow({ where: { providerUserId: '6006' } });
    expect(row.accessTokenEnc).toBeTruthy();
    expect(row.accessTokenEnc).not.toContain('tok-6006');

    await api()
      .delete('/api/v1/me/oauth-accounts/github')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    expect(await prisma.oAuthAccount.count({ where: { providerUserId: '6006' } })).toBe(0);
  });

  it('บัญชี GitHub ที่ผูกกับคนอื่นอยู่แล้ว → ผูกซ้ำไม่ได้', async () => {
    fake = {
      provider: 'github',
      id: '7007',
      email: uniqueEmail('gh-a'),
      verified: true,
      name: 'A',
    };
    await callback('github', await begin('github')); // คนแรกสมัครด้วย GitHub นี้

    const token = await registerAndLogin(app, 'gh-b');
    const link = await api()
      .post('/api/v1/auth/oauth/github/link')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    const res = await callback('github', await begin('github', new URL(link.body.url).search));
    expect(res.headers.location).toBe('http://web.test/settings?oauth_error=already_linked');
  });

  it('สมัครด้วย OAuth อย่างเดียว (ไม่มีรหัสผ่าน) → ยกเลิกการเชื่อมบัญชีสุดท้ายไม่ได้', async () => {
    fake = {
      provider: 'google',
      id: 'g-8008',
      email: uniqueEmail('g-only'),
      verified: true,
      name: 'x',
    };
    const res = await callback('google', await begin('google'));
    const refreshed = await api()
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie(res)!)
      .expect(200);
    const access = refreshed.body.accessToken as string;

    const conflict = await api()
      .delete('/api/v1/me/oauth-accounts/google')
      .set('Authorization', `Bearer ${access}`)
      .expect(409);
    expect(conflict.body.detail).toContain('ทางเข้าระบบทางเดียว');
  });

  it('ผู้ให้บริการไม่ได้ตั้งค่า → providers เป็น false และเริ่ม flow แล้วกลับหน้า login', async () => {
    const savedId = process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    const ctx = await createTestApp();
    try {
      const providers = await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/oauth/providers')
        .expect(200);
      expect(providers.body).toEqual({ google: true, github: false });
      const res = await request(ctx.app.getHttpServer())
        .get('/api/v1/auth/oauth/github')
        .expect(302);
      expect(res.headers.location).toBe('http://web.test/login?oauth_error=provider_disabled');
    } finally {
      await ctx.app.close();
      process.env.GITHUB_CLIENT_ID = savedId;
    }
  });
});
