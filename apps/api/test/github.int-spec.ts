import type { INestApplication } from '@nestjs/common';
import { nosionRef } from '@nosion/contracts';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/infra/config/env';
import { SecretBox } from '../src/infra/crypto/secret-box';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { RedisService } from '../src/infra/redis/redis.service';
import { GitHubService } from '../src/integrations/github/github.service';
import { signGitHubPayload } from '../src/integrations/github/signature';
import { createTestApp, registerAndLogin, resetRateLimits } from './helpers';

/**
 * GitHub ตัวจริงเรียกจากเทสต์ไม่ได้ — ปลอม GraphQL search ที่ fetch (แบ่งหน้าด้วย cursor จริง) ·
 * webhook ยิงเข้ามาเองพร้อมลายเซ็นจริง
 */
interface FakeIssue {
  node_id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  body: string | null;
  milestone: { due_on: string | null } | null;
  repository_url: string;
  assignees: Array<{ login: string }>;
  pull_request?: unknown;
  closed_at?: string | null;
  /** ช่อง "End Date" ของ GitHub Project */
  project_end?: string;
}

let issues: FakeIssue[] = [];
let lastSearch: { q: string; after: string | null; query: string } | null = null;
let githubStatus = 200;
/** token ที่ GraphQL ยอมรับ — OAuth (`gho_fake`) หรือ personal token ที่ผู้ใช้ใส่เอง */
let expectedTokens = ['gho_fake'];
/** personal token ที่ GitHub (GET /user) ยอมรับ → login + header X-OAuth-Scopes */
const PERSONAL_TOKENS: Record<string, { login: string; scopes: string | null }> = {
  ghp_yumyumClassicToken000000000000: { login: 'yumyum', scopes: 'repo, read:project' },
  github_pat_yumyumFineGrained0000000000: { login: 'yumyum', scopes: null },
};

/** issue (รูป REST) → node ของ GraphQL search */
function toNode(i: FakeIssue) {
  const isPr = Boolean(i.pull_request);
  return {
    __typename: isPr ? 'PullRequest' : 'Issue',
    id: i.node_id,
    number: i.number,
    title: i.title,
    url: i.html_url,
    body: i.body,
    closedAt: i.closed_at ?? null,
    ...(isPr ? { prState: i.state.toUpperCase() } : { state: i.state.toUpperCase() }),
    repository: { nameWithOwner: i.repository_url.replace('https://api.github.com/repos/', '') },
    milestone: i.milestone ? { dueOn: i.milestone.due_on } : null,
    assignees: { nodes: i.assignees },
    projectItems: {
      nodes: i.project_end
        ? [
            {
              fieldValues: {
                nodes: [
                  {
                    __typename: 'ProjectV2ItemFieldDateValue',
                    date: '2026-01-01',
                    field: { name: 'Start Date' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldDateValue',
                    date: i.project_end,
                    field: { name: 'End Date' },
                  },
                ],
              },
            },
          ]
        : [],
    },
  };
}
const realFetch = globalThis.fetch;

const fakeIssue = (n: number, over: Partial<FakeIssue> = {}): FakeIssue => ({
  node_id: `I_node${n}`,
  number: n,
  title: `Issue ${n}`,
  state: 'open',
  html_url: `https://github.com/jay/nosion/issues/${n}`,
  body: `รายละเอียด ${n}`,
  milestone: null,
  repository_url: 'https://api.github.com/repos/jay/nosion',
  assignees: [{ login: 'octocat' }],
  ...over,
});

describe('GitHub integration (Phase 8 ขั้น 5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    process.env.API_URL = 'http://web.test';
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    redis = ctx.redis;
    token = await registerAndLogin(app, 'github');
    const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    userId = me.body.user.id as string;

    // ผูก GitHub แบบที่ OAuth ทำ (ทางเดินเต็มของ OAuth อยู่ใน oauth.int-spec.ts)
    const account = await prisma.oAuthAccount.create({
      data: {
        userId,
        provider: 'github',
        providerUserId: '583231',
        login: 'octocat',
        scopes: 'read:user user:email',
      },
    });
    const config = app.get<AppConfig>(APP_CONFIG);
    await prisma.oAuthAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: new SecretBox(config.ENCRYPTION_KEY).seal(
          'gho_fake',
          `oauth-token:${account.id}`,
        ),
      },
    });
  });

  beforeEach(async () => {
    await resetRateLimits(redis);
    vi.spyOn(globalThis, 'fetch').mockImplementation(((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href === 'https://api.github.com/user') {
        const bearer = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
        const owner = bearer ? PERSONAL_TOKENS[bearer] : undefined;
        if (!owner) {
          return Promise.resolve(new Response('{"message":"Bad credentials"}', { status: 401 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ login: owner.login }), {
            status: 200,
            headers: owner.scopes === null ? {} : { 'X-OAuth-Scopes': owner.scopes },
          }),
        );
      }
      if (url.href === 'https://api.github.com/graphql') {
        expect(expectedTokens.map((t) => `Bearer ${t}`)).toContain(
          new Headers(init?.headers).get('authorization'),
        );
        if (githubStatus !== 200) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: 'Resource protected by organization SAML' }), {
              status: githubStatus,
            }),
          );
        }
        const { query, variables } = JSON.parse(String(init?.body)) as {
          query: string;
          variables: { q: string; after: string | null; first: number };
        };
        lastSearch = { q: variables.q, after: variables.after, query };
        const start = variables.after ? Number(variables.after) : 0;
        const end = start + variables.first;
        const body = {
          data: {
            search: {
              pageInfo: { hasNextPage: end < issues.length, endCursor: String(end) },
              nodes: issues.slice(start, end).map(toNode),
            },
          },
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return realFetch(input, init);
    }) as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.API_URL;
  });

  const api = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const taskFor = (n: number) =>
    prisma.entry.findFirstOrThrow({ where: { userId, clientId: `gh:I_node${n}` } });

  it('ดึงครั้งแรก: ทุก issue/PR ที่มอบหมาย รวมที่ปิดแล้ว · milestone = วันในปฏิทิน · ปิดแล้ว = เสร็จในวันที่ปิด', async () => {
    issues = [
      fakeIssue(1, { milestone: { due_on: '2026-10-20T07:00:00Z' } }),
      fakeIssue(2, { pull_request: {}, title: 'PR ที่ต้องรีวิว' }),
      // ปิดไปแล้วก่อนเชื่อม — 18:30Z วันที่ 30 ก.ย. = 01:30 วันที่ 1 ต.ค. เวลาไทย
      fakeIssue(3, { state: 'closed', closed_at: '2026-09-30T18:30:00Z' }),
    ];
    const res = await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
    expect(res.body).toEqual({ created: 3, updated: 0, completed: 0, unchanged: 0, more: false });
    expect(lastSearch?.q).toBe('assignee:octocat sort:updated-desc');
    // ยังไม่ได้สิทธิ์ read:project → ไม่ขอช่องของ Project (ขอแล้ว GitHub ปฏิเสธทั้ง query)
    expect(lastSearch?.query).not.toContain('projectItems');

    const three = await taskFor(3);
    expect(three.status).toBe('done');
    expect(three.completedAt?.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    const old = await auth(
      api().get('/api/v1/calendar?from=2026-09-29&to=2026-10-02&module=task'),
    ).expect(200);
    expect(
      (old.body.events as Array<{ entryId: string; date: string }>).find(
        (e) => e.entryId === three.id,
      )?.date,
    ).toBe('2026-10-01');

    const one = await taskFor(1);
    expect(one.module).toBe('task');
    expect(one.isAllDay).toBe(true);
    expect(one.payload).toMatchObject({
      github: { repo: 'jay/nosion', issueNumber: 1, state: 'open' },
    });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: one.projectId! } });
    expect(project.name).toBe('GitHub');
    expect((await taskFor(2)).occurredAt).toBeNull();

    // ขึ้นปฏิทินวันที่ 20 ตามโซนผู้ใช้
    const cal = await auth(
      api().get('/api/v1/calendar?from=2026-10-19&to=2026-10-21&module=task'),
    ).expect(200);
    const event = (cal.body.events as Array<{ entryId: string; date: string }>).find(
      (e) => e.entryId === one.id,
    );
    expect(event?.date).toBe('2026-10-20');

    const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
    expect(status.body).toMatchObject({
      connected: true,
      login: 'octocat',
      lastSyncCount: 3,
      projectDates: false,
      syncInProgress: false,
    });
  });

  it('ดึงซ้ำ: ไม่สร้างซ้ำ · issue ถูกปิด → งานเสร็จ · เปลี่ยนชื่อ → ตาม · ครั้งต่อไปถามเฉพาะที่เปลี่ยนหลังรอบก่อน', async () => {
    issues = [
      fakeIssue(1, { state: 'closed', milestone: { due_on: '2026-10-20T07:00:00Z' } }),
      fakeIssue(2, { pull_request: {}, title: 'PR ที่ต้องรีวิว (แก้ชื่อ)' }),
    ];
    const res = await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
    expect(res.body).toEqual({ created: 0, updated: 1, completed: 1, unchanged: 0, more: false });
    expect(lastSearch?.q).toMatch(
      /^assignee:octocat sort:updated-desc updated:>=\d{4}-\d{2}-\d{2}T/,
    );

    expect((await taskFor(1)).status).toBe('done');
    expect((await taskFor(2)).title).toBe('PR ที่ต้องรีวิว (แก้ชื่อ)');
    expect(await prisma.entry.count({ where: { userId, clientId: { startsWith: 'gh:' } } })).toBe(
      3,
    );
  });

  it('ได้สิทธิ์ read:project → วันในปฏิทินมาจากช่อง End Date ของ GitHub Project', async () => {
    await prisma.oAuthAccount.updateMany({
      where: { userId, provider: 'github' },
      data: { scopes: 'read:user user:email repo read:project' },
    });
    issues = [fakeIssue(4, { project_end: '2026-10-16' })];
    await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
    expect(lastSearch?.query).toContain('projectItems');
    const four = await taskFor(4);
    expect(four.occurredAt?.toISOString()).toBe('2026-10-15T17:00:00.000Z'); // 00:00 วันที่ 16 เวลาไทย
    const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
    expect(status.body).toMatchObject({ projectDates: true, privateRepos: true });
  });

  it('issue เยอะ → แบ่งดึงหลายรอบ จำ cursor ไว้ ดึงต่อจากที่ค้าง (ไม่ซ้ำ ไม่ข้าม)', async () => {
    const github = app.get(GitHubService);
    issues = Array.from({ length: 90 }, (_, i) => fakeIssue(100 + i));
    // งบเวลา 0 = หน้าเดียวต่อครั้ง (เหมือนเวลาของ function หมด)
    const first = await github.sync(userId, new Date(), 0);
    expect(first).toMatchObject({ created: 40, more: true });
    expect(
      (await auth(api().get('/api/v1/integrations/github')).expect(200)).body.syncInProgress,
    ).toBe(true);
    const second = await github.sync(userId, new Date(), 0);
    expect(lastSearch?.after).toBe('40');
    expect(second).toMatchObject({ created: 40, more: true });
    const third = await github.sync(userId, new Date(), 0);
    expect(third).toMatchObject({ created: 10, more: false });
    expect(
      await prisma.entry.count({ where: { userId, clientId: { startsWith: 'gh:I_node1' } } }),
    ).toBeGreaterThanOrEqual(90);
    const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
    expect(status.body.syncInProgress).toBe(false);
  });

  it('GitHub ปฏิเสธ (403) → 502 พร้อมเหตุผล · จำรหัสไว้ให้หน้าตั้งค่าแสดง', async () => {
    githubStatus = 403;
    try {
      const res = await auth(api().post('/api/v1/integrations/github/sync')).expect(502);
      expect(res.body.detail).toContain('org อาจยังไม่อนุมัติ');
      const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
      expect(status.body.lastSyncError).toBe('forbidden');
    } finally {
      githubStatus = 200;
    }
  });

  it('ผู้ใช้ลบงานแล้ว → ดึงอีกก็ไม่กลับมา', async () => {
    const two = await taskFor(2);
    await auth(api().delete(`/api/v1/entries/${two.id}`)).expect(204);
    issues = [fakeIssue(2, { pull_request: {}, title: 'ชื่อใหม่อีก' })];
    const res = await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
    expect(res.body).toMatchObject({ created: 0, unchanged: 1 });
  });

  describe('webhook', () => {
    let hookUrl: string;
    let secret: string;

    beforeAll(async () => {
      const res = await auth(api().post('/api/v1/integrations/github/webhook')).expect(201);
      hookUrl = new URL(res.body.url as string).pathname;
      secret = res.body.secret as string;
      expect(res.body.url).toMatch(/^http:\/\/web\.test\/api\/v1\/webhooks\/github\//);
    });

    function deliver(event: string, payload: unknown, sign = secret) {
      const body = JSON.stringify(payload);
      return api()
        .post(hookUrl)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', event)
        .set('X-Hub-Signature-256', signGitHubPayload(sign, body))
        .send(body);
    }

    it('ลายเซ็นผิด / id มั่ว → 404 · ping → pong', async () => {
      await deliver('ping', { zen: 'hi' }, 'wrong-secret').expect(404);
      await api()
        .post('/api/v1/webhooks/github/not-a-real-id')
        .set('X-Hub-Signature-256', signGitHubPayload(secret, '{}'))
        .send({})
        .expect(404);
      const ping = await deliver('ping', { zen: 'hi' }).expect(200);
      expect(ping.body.handled).toBe('pong');
    });

    it('PR merged ที่อ้าง nosion:<id> → ปิดงานนั้น · งานของผู้ใช้อื่นไม่ถูกแตะ (IDOR)', async () => {
      const mine = await auth(api().post('/api/v1/entries'))
        .send({ module: 'task', title: 'งานที่ PR จะปิด' })
        .expect(201);
      const otherToken = await registerAndLogin(app, 'github-other');
      const theirs = await api()
        .post('/api/v1/entries')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ module: 'task', title: 'งานของคนอื่น' })
        .expect(201);

      const pr = {
        action: 'closed',
        repository: { full_name: 'jay/nosion' },
        pull_request: {
          number: 77,
          merged: true,
          title: 'แก้บั๊ก',
          body: `ปิด ${nosionRef(mine.body.id)} และ ${nosionRef(theirs.body.id)}`,
          head: { ref: 'fix/x' },
        },
      };
      // ยังไม่ merge (แค่ปิด) → ไม่ปิดงาน
      await deliver('pull_request', {
        ...pr,
        pull_request: { ...pr.pull_request, merged: false },
      }).expect(200);
      expect((await prisma.entry.findUniqueOrThrow({ where: { id: mine.body.id } })).status).toBe(
        'pending',
      );

      const res = await deliver('pull_request', pr).expect(200);
      expect(res.body.handled).toContain('ปิด 1 งาน');
      expect((await prisma.entry.findUniqueOrThrow({ where: { id: mine.body.id } })).status).toBe(
        'done',
      );
      expect((await prisma.entry.findUniqueOrThrow({ where: { id: theirs.body.id } })).status).toBe(
        'pending',
      );
    });

    it('PR merged → งานที่ดึงมาจาก PR ตัวนั้นเองก็ปิด', async () => {
      issues = [fakeIssue(9, { pull_request: {}, title: 'PR #9' })];
      await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
      await deliver('pull_request', {
        action: 'closed',
        repository: { full_name: 'jay/nosion' },
        pull_request: { number: 9, merged: true, title: 'PR #9', body: null, head: { ref: 'x' } },
      }).expect(200);
      expect((await taskFor(9)).status).toBe('done');
    });

    it('event issues: มอบหมายให้เรา → สร้างงานทันที · ของคนอื่นใน repo เดียวกัน → ไม่สนใจ', async () => {
      const { repository_url: _, ...assigned } = fakeIssue(20, { title: 'มาจาก webhook' });
      const created = await deliver('issues', {
        action: 'assigned',
        repository: { full_name: 'jay/nosion' },
        issue: assigned,
      }).expect(200);
      expect(created.body.handled).toBe('issues.assigned: create');
      expect((await taskFor(20)).title).toBe('มาจาก webhook');

      const { repository_url: __, ...others } = fakeIssue(21, {
        assignees: [{ login: 'someone-else' }],
      });
      const ignored = await deliver('issues', {
        action: 'opened',
        repository: { full_name: 'jay/nosion' },
        issue: others,
      }).expect(200);
      expect(ignored.body.handled).toContain('ไม่ใช่ issue ของผู้ใช้นี้');

      // ปิด issue บน GitHub (เช่น PR "Closes #20" ถูก merge) → งานเสร็จ
      await deliver('issues', {
        action: 'closed',
        repository: { full_name: 'jay/nosion' },
        issue: { ...assigned, state: 'closed' },
      }).expect(200);
      expect((await taskFor(20)).status).toBe('done');
    });

    it('หมุน secret → ลายเซ็นด้วย secret เดิมใช้ไม่ได้ · ปิด webhook → 404', async () => {
      const old = secret;
      const rotated = await auth(api().post('/api/v1/integrations/github/webhook')).expect(201);
      secret = rotated.body.secret as string;
      await deliver('ping', {}, old).expect(404);
      await deliver('ping', {}).expect(200);

      await auth(api().delete('/api/v1/integrations/github/webhook')).expect(204);
      await deliver('ping', {}).expect(404);
    });
  });

  it('ยังไม่เชื่อม GitHub → ดึงไม่ได้ (409)', async () => {
    const other = await registerAndLogin(app, 'no-github');
    const res = await api()
      .post('/api/v1/integrations/github/sync')
      .set('Authorization', `Bearer ${other}`)
      .expect(409);
    expect(res.body.detail).toContain('ยังไม่ได้เชื่อม GitHub');
  });

  describe('personal access token (org จำกัด OAuth app)', () => {
    const classic = 'ghp_yumyumClassicToken000000000000';
    const fineGrained = 'github_pat_yumyumFineGrained0000000000';

    afterEach(() => {
      expectedTokens = ['gho_fake'];
    });

    it('รูปแบบผิด → 422 · GitHub ไม่รับ token → 422 · ไม่เก็บอะไร', async () => {
      await auth(api().put('/api/v1/integrations/github/token')).send({ token: 'abc' }).expect(422);
      const res = await auth(api().put('/api/v1/integrations/github/token'))
        .send({ token: 'ghp_revokedToken0000000000000000' })
        .expect(422);
      expect(res.body.detail).toContain('GitHub ไม่รับ token นี้');
      const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
      expect(status.body).toMatchObject({ tokenSource: 'oauth', login: 'octocat' });
    });

    it('ใส่ token → ใช้แทน OAuth · ค้นด้วย login ของเจ้าของ token · ดึงใหม่ทั้งหมด · เอาออก → กลับไปใช้ OAuth', async () => {
      const saved = await auth(api().put('/api/v1/integrations/github/token'))
        .send({ token: ` ${classic} ` })
        .expect(200);
      expect(saved.body).toMatchObject({
        connected: true,
        tokenSource: 'personal',
        login: 'yumyum',
        privateRepos: true,
        projectDates: true,
        lastSyncAt: null,
      });
      const row = await prisma.gitHubIntegration.findUniqueOrThrow({ where: { userId } });
      expect(row.personalTokenEnc).not.toContain(classic);

      expectedTokens = [classic];
      issues = [fakeIssue(30, { assignees: [{ login: 'yumyum' }], title: 'งานใน repo ของ org' })];
      await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
      expect(lastSearch?.q).toContain('assignee:yumyum');
      expect(lastSearch?.q).not.toContain('updated:');
      expect((await taskFor(30)).title).toBe('งานใน repo ของ org');

      await auth(api().delete('/api/v1/integrations/github/token')).expect(204);
      const status = await auth(api().get('/api/v1/integrations/github')).expect(200);
      expect(status.body).toMatchObject({ tokenSource: 'oauth', login: 'octocat' });
      expectedTokens = ['gho_fake'];
      await auth(api().post('/api/v1/integrations/github/sync')).expect(200);
      expect(lastSearch?.q).toContain('assignee:octocat');
    });

    it('ไม่เคยผูก GitHub ด้วย OAuth ก็ใช้ token แบบ fine-grained ดึงได้ (cron ก็ดึงให้)', async () => {
      const other = await registerAndLogin(app, 'pat-only');
      const saved = await api()
        .put('/api/v1/integrations/github/token')
        .set('Authorization', `Bearer ${other}`)
        .send({ token: fineGrained })
        .expect(200);
      expect(saved.body).toMatchObject({
        connected: true,
        tokenSource: 'personal',
        privateRepos: true,
        projectDates: false,
      });

      // cron ดึงให้ผู้ใช้ OAuth คนเดิมด้วย
      expectedTokens = ['gho_fake', fineGrained];
      issues = [fakeIssue(31, { assignees: [{ login: 'yumyum' }] })];
      const due = await app.get(GitHubService).syncDue(100);
      expect(due.failed).toBe(0);
      const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${other}`).expect(200);
      const task = await prisma.entry.findFirst({
        where: { userId: me.body.user.id as string, clientId: 'gh:I_node31' },
      });
      expect(task).not.toBeNull();
    });
  });
});
