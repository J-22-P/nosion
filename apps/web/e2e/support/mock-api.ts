import type { Page, Route } from '@playwright/test';
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
    if (method === 'GET' && path === '/entries' && url.searchParams.get('module') === 'expense') {
      return json({ data: EXPENSES, pageInfo: { hasMore: false, nextCursor: null } });
    }
    if (method === 'GET' && path === '/entries') {
      const done = url.searchParams.get('status') === 'done';
      const data = done ? DONE_TASKS : ACTIVE_TASKS;
      return json({ data, pageInfo: { hasMore: false, nextCursor: null } });
    }

    console.warn(`[mock-api] ไม่มี mock สำหรับ ${method} ${path}`);
    return json({ type: 'about:blank', title: 'Not mocked', status: 404, detail: path }, 404);
  });
}
