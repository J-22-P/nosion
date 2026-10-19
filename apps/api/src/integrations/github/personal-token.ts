import { GitHubSyncError } from './github-search';

export interface TokenOwner {
  login: string;
  /** scope ของ token classic · fine-grained ไม่มี header นี้ → [] */
  scopes: string[];
}

/** token fine-grained กำหนดสิทธิ์ราย repo ไม่มี scope — ถือว่าเห็น repo ส่วนตัวที่ผู้ใช้เลือกไว้ */
export function isFineGrained(token: string): boolean {
  return token.startsWith('github_pat_');
}

/** ตรวจ token ก่อนเก็บ — ใช้ได้จริงไหม เป็นของใคร (login ใช้ค้น `assignee:`) ได้ scope อะไร */
export async function fetchTokenOwner(token: string): Promise<TokenOwner> {
  let res: Response;
  try {
    res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'NOSION',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    throw new GitHubSyncError('unreachable', (err as Error).message);
  }
  if (res.status === 401) throw new GitHubSyncError('revoked', 'GitHub ตอบ 401');
  if (res.status === 403 || res.status === 429) {
    const limited = res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0';
    throw new GitHubSyncError(limited ? 'rate_limited' : 'forbidden', `GitHub ตอบ ${res.status}`);
  }
  if (!res.ok) throw new GitHubSyncError(`http_${res.status}`, `GitHub ตอบ ${res.status}`);
  const user = (await res.json()) as { login: string };
  const scopes = (res.headers.get('x-oauth-scopes') ?? '').split(/[ ,]/).filter(Boolean);
  return { login: user.login, scopes };
}
