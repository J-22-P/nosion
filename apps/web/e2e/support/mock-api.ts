import type { Page, Route } from '@playwright/test';
import { nextOccurrences, toFloating } from '@nosion/core/recurrence';
import { resolveDateInput } from '@nosion/core/time';
import {
  ACTIVE_TASKS,
  BILLS,
  BUDGET_STATUS,
  DONE_TASKS,
  EXPENSES,
  FOCUS_TODAY,
  FORECAST,
  PROJECTS,
  SETTINGS,
  SIDEBAR,
  STANDUP,
  SUMMARY,
  TAGS,
  TODAY,
  TRENDS,
  USER,
} from './mock-data';

/**
 * แทน API จริงทั้งชุดด้วย page.route — UI test จึงไม่ต้องมี NestJS / Postgres / Redis
 * และได้ข้อมูลเหมือนเดิมทุกครั้ง (screenshot เทียบกันได้)
 *
 * ดักทุก host ที่ path ขึ้นต้นด้วย /api/v1 → ไม่สนว่า web ถูก build ด้วย NEXT_PUBLIC_API_URL อะไร
 * endpoint ที่ไม่รู้จักตอบ 404 + log ไว้ เพื่อให้เห็นทันทีเมื่อหน้าเรียก API ใหม่ที่ยังไม่มี mock
 */
export async function mockApi(page: Page, options: { authenticated?: boolean } = {}) {
  const authenticated = options.authenticated ?? true;

  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && path === '/auth/refresh') {
      return authenticated
        ? json({ accessToken: 'test-access-token', expiresIn: 900 })
        : json({ type: 'about:blank', title: 'Unauthorized', status: 401 }, 401);
    }
    if (method === 'GET' && path === '/me') return json({ user: USER, settings: SETTINGS });
    if (method === 'GET' && path === '/projects') return json(PROJECTS);
    if (method === 'GET' && path === '/tags') return json(TAGS);
    if (method === 'GET' && path === '/tasks/sidebar') return json(SIDEBAR);
    if (method === 'GET' && path === '/tasks/focus/today') return json(FOCUS_TODAY);
    if (method === 'GET' && path === '/today') return json(TODAY);
    if (method === 'GET' && path === '/tasks/standup/today') return json(STANDUP);
    if (method === 'GET' && path === '/budgets/status') return json(BUDGET_STATUS);
    if (method === 'GET' && path === '/expenses/forecast') return json(FORECAST);
    if (method === 'GET' && path === '/expenses/bills/upcoming') return json(BILLS);
    if (method === 'GET' && path === '/expenses/trends') return json(TRENDS);
    if (method === 'GET' && path === '/expenses/summary') return json(SUMMARY);
    if (method === 'GET' && path === '/entries' && url.searchParams.get('module') === 'expense') {
      return json({ data: EXPENSES, pageInfo: { hasMore: false, nextCursor: null } });
    }
    if (method === 'GET' && path === '/entries') {
      const done = url.searchParams.get('status') === 'done';
      const data = done ? DONE_TASKS : ACTIVE_TASKS;
      return json({ data, pageInfo: { hasMore: false, nextCursor: null } });
    }

    // preview ใช้ engine จริง — UI test เห็นผล clamp/วันในสัปดาห์เหมือน API จริง (โซนผู้ใช้ = เวลาไทย)
    if (method === 'POST' && path === '/recurrence-rules/preview') {
      return json(previewOf(route.request().postDataJSON() as PreviewBody));
    }
    if (method === 'POST' && path === '/recurrence-rules/materialize') {
      return json({ rules: 2, created: 3 });
    }
    if (method === 'POST' && path === '/recurrence-rules') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      return json({ id: 'rule-new', exceptions: [], isPaused: false, ...body }, 201);
    }

    console.warn(`[mock-api] ไม่มี mock สำหรับ ${method} ${path}`);
    return json({ type: 'about:blank', title: 'Not mocked', status: 404, detail: path }, 404);
  });
}

interface PreviewBody {
  rrule: string;
  startsAt: string;
  endType: 'never' | 'onDate' | 'afterCount';
  endsAt?: string;
  maxCount?: number;
  limit?: number;
}

function previewOf(body: PreviewBody) {
  const timezone = SETTINGS.timezone;
  const startsAt = resolveDateInput(body.startsAt, timezone);
  const end =
    body.endType === 'onDate' && body.endsAt
      ? { type: 'onDate' as const, endsAt: resolveDateInput(body.endsAt, timezone) }
      : body.endType === 'afterCount' && body.maxCount
        ? { type: 'afterCount' as const, maxCount: body.maxCount }
        : { type: 'never' as const };
  const dates = nextOccurrences(
    { rrule: body.rrule, startsAt, timezone, end },
    new Date(startsAt.getTime() - 1),
    body.limit ?? 10,
  );
  return {
    timezone,
    occurrences: dates.map((d) => d.toISOString()),
    localDates: dates.map((d) => toFloating(d, timezone).toISOString().slice(0, 10)),
  };
}
