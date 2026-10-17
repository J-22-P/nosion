/**
 * นำเข้า issue/PR ที่มอบหมายให้คุณจาก GitHub → งานใน NOSION ผ่าน Public API (API key)
 *
 * ใช้เมื่อ organization ไม่อนุมัติแอป NOSION: GitHub ซ่อนงานของ org จากแอปที่ไม่ได้อนุมัติ แต่ `gh` (GitHub CLI)
 * ในเครื่องคุณอ่านได้อยู่แล้ว — สคริปต์นี้อ่านด้วย `gh` แล้วส่งเข้า NOSION ด้วย API key ของคุณเอง
 *
 *   cd apps/api
 *   NOSION_API_KEY=nos_… pnpm exec tsx scripts/import-github.mts            # นำเข้าจริง
 *   NOSION_API_KEY=nos_… DRY_RUN=1 pnpm exec tsx scripts/import-github.mts  # ดูก่อนว่าจะได้อะไร
 *
 * ตัวแปรอื่น (ไม่บังคับ): NOSION_URL (ค่าเริ่มต้น staging) · NOSION_TIMEZONE (Asia/Bangkok) · GITHUB_LOGIN (จาก gh) ·
 *   LIMIT=5 (ลองไม่กี่รายการก่อน)
 *
 * ใช้ตัวค้นและกติกาเดียวกับการดึงอัตโนมัติ (github-search.ts · issue-plan.ts) — clientId `gh:<node_id>` ตัวเดียวกัน:
 *  • รันซ้ำได้ ไม่สร้างซ้ำ · งานที่เปลี่ยนบน GitHub ถูกอัปเดต · งานที่คุณลบใน NOSION ไม่กลับมา
 *  • วันหลัง org อนุมัติแอป → การดึงอัตโนมัติดูแลงานชุดนี้ต่อได้ทันที
 * API key ต้องมีสิทธิ์ read + write · จำกัด 60 คำขอ/นาที — สคริปต์รอเองเมื่อถึงเพดาน (300 งาน ≈ 10 นาที)
 */
import { taskPayloadSchema, type EntryDto } from '@nosion/contracts';
import { execFileSync } from 'node:child_process';
import {
  fetchSearchPage,
  searchQuery,
  type SearchPage,
} from '../src/integrations/github/github-search';
import {
  issueClientId,
  planIssue,
  taskFieldsFor,
  type GitHubIssue,
} from '../src/integrations/github/issue-plan';

const BASE = (process.env.NOSION_URL ?? 'https://nosion-staging-web.vercel.app').replace(/\/$/, '');
const KEY = process.env.NOSION_API_KEY;
const TZ = process.env.NOSION_TIMEZONE ?? 'Asia/Bangkok';
const DRY_RUN = Boolean(process.env.DRY_RUN);
/** ลองกับไม่กี่รายการก่อน (เช่น LIMIT=5) */
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

if (!KEY?.startsWith('nos_')) {
  console.error(
    'ตั้ง NOSION_API_KEY=nos_… ก่อน (สร้างที่ NOSION → Settings → API keys · สิทธิ์ Read + Write)',
  );
  process.exit(1);
}

const gh = (...args: string[]) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const token = gh('auth', 'token');
const login = process.env.GITHUB_LOGIN ?? gh('api', 'user', '--jq', '.login');
// สิทธิ์ของ token อยู่ใน header X-OAuth-Scopes · มี project/read:project = อ่านช่องวันที่ของ GitHub Project ได้
const scopes = /x-oauth-scopes:(.*)/i.exec(gh('api', '-i', 'user'))?.[1] ?? '';
const withProjects = /(^|[\s,])(read:)?project([\s,]|$)/.test(scopes);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เรียก NOSION — ถึงเพดาน 60/นาที (429) แล้วรอตาม Retry-After ลองใหม่ */
async function nosion<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  for (;;) {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Number(
        res.headers.get('retry-after') ?? res.headers.get('ratelimit-reset') ?? 30,
      );
      process.stdout.write(`  (ถึงเพดาน 60/นาที — รอ ${wait} วิ)\n`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    if (res.status >= 400 && res.status !== 409) {
      throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
    }
    return { status: res.status, data };
  }
}

// ── 1. อ่านจาก GitHub ─────────────────────────────────────
console.log(
  `อ่าน issue/PR ที่มอบหมายให้ ${login} จาก GitHub${withProjects ? ' (+ วันจาก GitHub Project)' : ''}…`,
);
const issues: GitHubIssue[] = [];
let cursor: string | null = null;
do {
  const page: SearchPage = await fetchSearchPage(
    token,
    searchQuery(login, null),
    cursor,
    withProjects,
  );
  issues.push(...page.issues);
  cursor = page.hasNextPage ? page.endCursor : null;
  process.stdout.write(`  ${issues.length} รายการ\r`);
} while (cursor);

const dated = issues.filter((i) => taskFieldsFor(i, TZ).occurredAt).length;
console.log(
  `\nพบ ${issues.length} รายการ · เปิดอยู่ ${issues.filter((i) => i.state === 'open').length} · ` +
    `ขึ้นปฏิทินได้ ${dated} · ไม่มีวัน ${issues.length - dated}`,
);
if (DRY_RUN) {
  for (const i of issues.slice(0, 15)) {
    const f = taskFieldsFor(i, TZ);
    console.log(
      `  ${f.occurredAt ?? '(ไม่มีวัน)'.padEnd(10)}  ${i.state.padEnd(6)}  ${f.github.repo}#${i.number}  ${f.title.slice(0, 60)}`,
    );
  }
  console.log('DRY_RUN — ยังไม่ได้ส่งเข้า NOSION');
  process.exit(0);
}

// ── 2. โปรเจกต์ "GitHub" (ชื่อเดียวกับการดึงอัตโนมัติ) ─────────
const projects = await nosion<Array<{ id: string; name: string }>>('GET', '/projects');
const projectId =
  projects.data.find((p) => p.name === 'GitHub')?.id ??
  (
    await nosion<{ id: string }>('POST', '/projects', {
      name: 'GitHub',
      color: '#24292f',
      icon: 'github',
    })
  ).data.id;

// งานที่นำเข้าแล้ว (จับคู่ด้วยลิงก์ของ issue — API ไม่คืน clientId) · ทุกสถานะ
const existingByUrl = new Map<string, EntryDto>();
let after: string | null = null;
do {
  const q: URLSearchParams = new URLSearchParams({
    module: 'task',
    projectId,
    status: 'pending,active,done,cancelled,skipped',
    limit: '100',
    ...(after ? { cursor: after } : {}),
  });
  const page: { data: { data: EntryDto[]; pageInfo: { nextCursor: string | null } } } =
    await nosion<{
      data: EntryDto[];
      pageInfo: { nextCursor: string | null };
    }>('GET', `/entries?${q}`);
  for (const e of page.data.data) {
    const url = taskPayloadSchema.parse(e.payload ?? {}).github?.url;
    if (url) existingByUrl.set(url, e);
  }
  after = page.data.pageInfo.nextCursor;
} while (after);

// ── 3. ส่งเข้า NOSION ────────────────────────────────────
const count = { created: 0, updated: 0, completed: 0, unchanged: 0, deleted: 0 };
const todo = issues.slice(0, LIMIT);
for (const [n, issue] of todo.entries()) {
  const fields = taskFieldsFor(issue, TZ);
  const known = existingByUrl.get(issue.html_url);
  if (known) {
    const plan = planIssue(
      issue,
      {
        id: known.id,
        version: known.version,
        title: known.title,
        status: known.status,
        deleted: false,
        hasDate: known.occurredAt !== null,
        github: taskPayloadSchema.parse(known.payload ?? {}).github,
      },
      TZ,
    );
    if (plan.kind === 'update') {
      await nosion('PATCH', `/entries/${known.id}`, {
        version: plan.version,
        ...plan.patch,
        payload: { github: plan.github },
      });
      if (plan.completes) {
        await nosion('POST', `/entries/${known.id}/complete`);
        count.completed++;
      } else count.updated++;
    } else count.unchanged++;
    process.stdout.write(`  ${n + 1}/${todo.length}\r`);
    continue;
  }
  // clientId ซ้ำ → API คืนงานเดิม (ไม่สร้างใหม่) · 409 = งานนั้นถูกลบไปแล้ว (ไม่สร้างกลับ)
  const res = await nosion<EntryDto>('POST', '/entries', {
    module: 'task',
    title: fields.title,
    description: fields.description,
    occurredAt: fields.occurredAt,
    isAllDay: true,
    payload: { github: fields.github },
    projectId,
    clientId: issueClientId(issue),
  });
  if (res.status === 409) {
    count.deleted++;
    continue;
  }
  // ไม่อยู่ในโปรเจกต์ GitHub แต่ clientId ซ้ำ (ผู้ใช้ย้ายงานไปโปรเจกต์อื่น) → API คืนงานเดิม ไม่สร้างซ้ำ
  const entry = res.data;
  if (entry.deletedAt) {
    count.deleted++; // ผู้ใช้ลบไปแล้ว — ไม่สร้างกลับ
    continue;
  }
  count.created++;
  if (issue.state === 'closed' && entry.status !== 'done') {
    await nosion('POST', `/entries/${entry.id}/complete`);
  }
  process.stdout.write(`  ${n + 1}/${todo.length}\r`);
}

console.log(
  `\nเสร็จ — ใหม่ ${count.created} · อัปเดต ${count.updated} · ปิด ${count.completed} · ` +
    `ไม่เปลี่ยน ${count.unchanged} · ข้าม (ลบไปแล้ว) ${count.deleted}`,
);
console.log(`ดูได้ที่ ${BASE}/calendar · งานอยู่ในโปรเจกต์ "GitHub"`);
