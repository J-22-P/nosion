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
 *   LIMIT=5 (ลองไม่กี่รายการก่อน) · IMAGES=0 (ไม่ส่งรูปย่อ)
 *
 * รูปใน issue ของ repo ส่วนตัวฝังในหน้า NOSION ไม่ได้ (เบราว์เซอร์ไม่ส่งคุกกี้ GitHub) → สคริปต์เปิดรูปด้วยสิทธิ์ `gh`
 * ย่อเป็น WebP กว้าง ≤ 800px (ราว 10–60 KB) แล้วเก็บไว้ที่ NOSION · รูปที่ส่งแล้วไม่ส่งซ้ำ · รูปที่ถูกเอาออกจาก issue ถูกลบ
 *
 * ใช้ตัวค้นและกติกาเดียวกับการดึงอัตโนมัติ (github-search.ts · issue-plan.ts) — clientId `gh:<node_id>` ตัวเดียวกัน:
 *  • รันซ้ำได้ ไม่สร้างซ้ำ · งานที่เปลี่ยนบน GitHub ถูกอัปเดต · งานที่คุณลบใน NOSION ไม่กลับมา
 *  • วันหลัง org อนุมัติแอป → การดึงอัตโนมัติดูแลงานชุดนี้ต่อได้ทันที
 * API key ต้องมีสิทธิ์ read + write · จำกัด 60 คำขอ/นาที — สคริปต์รอเองเมื่อถึงเพดาน (300 งาน ≈ 10 นาที)
 */
import { taskPayloadSchema, type EntryDto } from '@nosion/contracts';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import {
  fetchSearchPage,
  searchQuery,
  type SearchPage,
} from '../src/integrations/github/github-search';
import { githubImageUrls } from '../src/integrations/github/issue-images';
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
const IMAGES = process.env.IMAGES !== '0';
/** รูปย่อ: กว้างไม่เกินเท่านี้ (รูปหน้าจอ 800px ยังอ่านตัวหนังสือได้) */
const THUMB_WIDTH = 800;

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
/** งานใน NOSION ของแต่ละ issue (ไม่รวมที่ผู้ใช้ลบ) + description ที่ใช้หารูป */
const entryOf = new Map<string, { id: string; description: string }>();
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
    entryOf.set(issue.html_url, { id: known.id, description: fields.description });
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
  entryOf.set(issue.html_url, { id: entry.id, description: fields.description });
  if (issue.state === 'closed' && entry.status !== 'done') {
    await nosion('POST', `/entries/${entry.id}/complete`);
  }
  process.stdout.write(`  ${n + 1}/${todo.length}\r`);
}

// ── 4. รูปย่อของรูปใน issue ──────────────────────────────
const images = { uploaded: 0, removed: 0, failed: 0, bytes: 0 };
if (IMAGES) {
  const stored = await nosion<Array<{ entryId: string; sourceUrl: string }>>(
    'GET',
    '/entry-images',
  );
  const storedBy = new Map<string, Set<string>>();
  for (const i of stored.data) {
    storedBy.set(i.entryId, (storedBy.get(i.entryId) ?? new Set()).add(i.sourceUrl));
  }
  const withImages = [...entryOf.values()].filter(
    (e) => githubImageUrls(e.description).length > 0 || storedBy.has(e.id),
  );
  if (withImages.length) console.log(`\nรูปใน issue: ${withImages.length} งาน`);
  for (const [n, entry] of withImages.entries()) {
    const urls = githubImageUrls(entry.description);
    const have = storedBy.get(entry.id) ?? new Set<string>();
    for (const url of urls.filter((u) => !have.has(u))) {
      try {
        const thumb = await thumbnail(url);
        await nosion('PUT', `/entries/${entry.id}/images`, {
          sourceUrl: url,
          data: thumb.data.toString('base64'),
          width: thumb.width,
          height: thumb.height,
        });
        images.uploaded++;
        images.bytes += thumb.data.length;
      } catch (error) {
        images.failed++;
        console.warn(`\n  ข้ามรูป ${url}: ${(error as Error).message}`);
      }
    }
    if ([...have].some((u) => !urls.includes(u))) {
      const res = await nosion<{ deleted: number }>('POST', `/entries/${entry.id}/images/prune`, {
        keep: urls,
      });
      images.removed += res.data.deleted;
    }
    process.stdout.write(`  ${n + 1}/${withImages.length}\r`);
  }
}

console.log(
  `\nเสร็จ — ใหม่ ${count.created} · อัปเดต ${count.updated} · ปิด ${count.completed} · ` +
    `ไม่เปลี่ยน ${count.unchanged} · ข้าม (ลบไปแล้ว) ${count.deleted}`,
);
if (IMAGES) {
  console.log(
    `รูปย่อ — ส่งใหม่ ${images.uploaded} (${Math.round(images.bytes / 1024)} KB) · ลบ ${images.removed}` +
      (images.failed ? ` · ข้าม ${images.failed}` : ''),
  );
}
console.log(`ดูได้ที่ ${BASE}/calendar · งานอยู่ในโปรเจกต์ "GitHub"`);

/**
 * เปิดรูปด้วยสิทธิ์ของ `gh` (GitHub redirect ไปลิงก์ S3 ที่มีอายุ 5 นาที — fetch ตัด Authorization ทิ้งเองเมื่อข้ามโดเมน)
 * แล้วย่อเป็น WebP · ใหญ่เกินเพดานของ API (400 KB) ลดคุณภาพลงอีกรอบ
 */
async function thumbnail(url: string): Promise<{ data: Buffer; width: number; height: number }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GitHub ตอบ ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());
  for (const quality of [72, 50]) {
    const { data, info } = await sharp(original, { animated: false })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= 400 * 1024) return { data, width: info.width, height: info.height };
  }
  throw new Error('ย่อแล้วยังใหญ่เกิน 400 KB');
}
