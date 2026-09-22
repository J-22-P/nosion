import type { ProblemDetails } from '@nosion/contracts';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const BASE = `${API_URL}/api/v1`;

/** error ที่พก Problem Details มาด้วย → ฟอร์มผูก error ราย field ได้ทันที */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** map path → ข้อความ สำหรับส่งเข้า react-hook-form */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem.errors ?? []).map((e) => [e.path.replace(/^payload\./, ''), e.message]),
    );
  }
}

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;

let getToken: TokenGetter = () => null;
let setToken: TokenSetter = () => undefined;

/** ผูก api client เข้ากับ store โดยไม่ให้ layer ล่างต้อง import store (กันวงจร import) */
export function bindTokenStore(getter: TokenGetter, setter: TokenSetter): void {
  getToken = getter;
  setToken = setter;
}

let refreshInFlight: Promise<string | null> | null = null;

/**
 * หมุน access token ใหม่จาก refresh cookie
 * single-flight: หลายคำขอที่เจอ 401 พร้อมกันจะรอ refresh ครั้งเดียว ไม่ยิงซ้อนกัน
 * (ยิงซ้อนกันจะถูกตีความว่าเป็น token reuse แล้วโดนเตะออกทั้งระบบ)
 */
async function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string };
      setToken(body.accessToken);
      return body.accessToken;
    } catch {
      return null;
    } finally {
      // ปล่อยให้คำขอถัดไปเริ่ม refresh รอบใหม่ได้
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** ข้ามการแนบ access token (ใช้กับ endpoint สาธารณะ) */
  anonymous?: boolean;
  /** ใช้ภายใน กันวนลูป refresh ไม่รู้จบ */
  _retried?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, _retried, headers, ...rest } = options;
  const token = anonymous ? null : getToken();

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !anonymous && !_retried) {
    const fresh = await refreshAccessToken();
    if (fresh) return apiFetch<T>(path, { ...options, _retried: true });
    setToken(null);
  }

  if (!res.ok) {
    throw new ApiError(await readProblem(res));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function readProblem(res: Response): Promise<ProblemDetails> {
  try {
    const parsed = (await res.json()) as Partial<ProblemDetails>;
    return {
      type: parsed.type ?? 'about:blank',
      title: parsed.title ?? res.statusText,
      status: parsed.status ?? res.status,
      detail: parsed.detail,
      traceId: parsed.traceId,
      errors: parsed.errors,
    };
  } catch {
    return {
      type: 'about:blank',
      title: res.statusText || 'Request failed',
      status: res.status,
      detail: 'เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่คาดคิด',
    };
  }
}

/** สร้าง query string จาก object โดยตัดค่าว่างทิ้ง */
export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
