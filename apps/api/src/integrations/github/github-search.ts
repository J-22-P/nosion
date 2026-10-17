import type { GitHubIssue } from './issue-plan';

/**
 * ค้น issue/PR ที่มอบหมายให้ผู้ใช้ด้วย GraphQL search (แทน REST `GET /issues?filter=assigned`):
 *  • ได้ทั้งที่เปิดอยู่และที่ปิดไปแล้ว (รวม repo ที่ archive แล้ว) ในคำค้นเดียว · สูงสุด 1,000 รายการตามข้อจำกัดของ search
 *  • อ่านช่องวันที่ของ GitHub Project ได้ในรอบเดียวกัน — REST ไม่มี
 *  • แบ่งหน้าด้วย cursor → ดึงต่อจากที่ค้างได้เมื่อเวลาของ function หมด
 */

export type GitHubSyncErrorCode =
  'revoked' | 'forbidden' | 'rate_limited' | 'unreachable' | `http_${number}`;

export class GitHubSyncError extends Error {
  constructor(
    readonly code: GitHubSyncErrorCode,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'GitHubSyncError';
  }
}

export interface SearchPage {
  issues: GitHubIssue[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export const SEARCH_PAGE_SIZE = 40;

/** `assignee:<login>` ทั้ง issue และ PR · `updated:>=` เมื่อดึงต่อจากรอบก่อน · เรียงเก่า → ใหม่ไม่ได้ (search เรียงได้แค่ตามที่กำหนด) */
export function searchQuery(login: string, since: Date | null): string {
  const parts = [`assignee:${login}`, 'sort:updated-desc'];
  if (since) parts.push(`updated:>=${since.toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
  return parts.join(' ');
}

const PROJECT_FIELDS = `
  projectItems(first: 5) {
    nodes {
      fieldValues(first: 30) {
        nodes {
          __typename
          ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { name } } }
          ... on ProjectV2ItemFieldIterationValue {
            startDate duration field { ... on ProjectV2IterationField { name } }
          }
        }
      }
    }
  }`;

function issueFields(withProjects: boolean): string {
  return `
    id number title url body closedAt
    repository { nameWithOwner }
    milestone { dueOn }
    assignees(first: 10) { nodes { login } }
    ${withProjects ? PROJECT_FIELDS : ''}`;
}

export function searchGraphQL(withProjects: boolean): string {
  return `query($q: String!, $after: String, $first: Int!) {
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on Issue { state ${issueFields(withProjects)} }
      ... on PullRequest { prState: state ${issueFields(withProjects)} }
    }
  }
}`;
}

interface FieldValue {
  __typename?: string;
  date?: string | null;
  startDate?: string | null;
  duration?: number | null;
  field?: { name?: string } | null;
}

interface SearchNode {
  __typename?: string;
  id?: string;
  number?: number;
  title?: string;
  url?: string;
  body?: string | null;
  closedAt?: string | null;
  state?: 'OPEN' | 'CLOSED';
  prState?: 'OPEN' | 'CLOSED' | 'MERGED';
  repository?: { nameWithOwner: string } | null;
  milestone?: { dueOn: string | null } | null;
  assignees?: { nodes: Array<{ login: string } | null> } | null;
  projectItems?: { nodes: Array<{ fieldValues: { nodes: Array<FieldValue | null> } } | null> };
}

const DUE_NAME = /end|due|deadline|finish|target|สิ้นสุด|กำหนด|ส่ง/i;
const START_NAME = /start|begin|เริ่ม/i;

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * วันกำหนดจากช่องของ GitHub Project (หลาย project ได้) — ชื่อช่องเป็นของแต่ละทีมเอง จึงเลือกตามความหมาย:
 *  1. ช่องวันที่ที่ชื่อสื่อว่า "สิ้นสุด/กำหนดส่ง" (End Date · Due · Deadline)
 *  2. iteration (Sprint) → วันสุดท้ายของรอบ
 *  3. ช่องวันที่ที่ชื่อสื่อว่า "เริ่ม" (Start Date)
 *  4. ช่องวันที่อื่น ๆ ตัวแรก
 */
export function projectDueDate(node: Pick<SearchNode, 'projectItems'>): string | null {
  const values = (node.projectItems?.nodes ?? [])
    .flatMap((item) => item?.fieldValues.nodes ?? [])
    .filter((v): v is FieldValue => Boolean(v));
  const dates = values.filter((v) => v.date);
  const named = (re: RegExp) => dates.find((v) => re.test(v.field?.name ?? ''))?.date ?? null;
  const iteration = values.find((v) => v.startDate && v.duration);
  return (
    (
      named(DUE_NAME) ??
      (iteration ? addDays(iteration.startDate!, iteration.duration! - 1) : null) ??
      named(START_NAME) ??
      dates[0]?.date ??
      null
    )?.slice(0, 10) ?? null
  );
}

/** ผลของ GraphQL → รูป REST ที่ planIssue ใช้ (node_id ของ GraphQL คือ node_id ตัวเดียวกับ REST/webhook) */
export function toIssue(node: SearchNode): GitHubIssue | null {
  if (!node.id || !node.number || !node.url || !node.repository) return null;
  const isPr = node.__typename === 'PullRequest';
  const rawState = isPr ? node.prState : node.state;
  return {
    node_id: node.id,
    number: node.number,
    title: node.title ?? '',
    state: rawState === 'OPEN' ? 'open' : 'closed',
    html_url: node.url,
    body: node.body ?? null,
    milestone: node.milestone ? { due_on: node.milestone.dueOn } : null,
    pull_request: isPr ? {} : undefined,
    repository_url: `https://api.github.com/repos/${node.repository.nameWithOwner}`,
    assignees: (node.assignees?.nodes ?? []).filter((a): a is { login: string } => Boolean(a)),
    closed_at: node.closedAt ?? null,
    project_due_on: projectDueDate(node),
  };
}

interface GraphQLResponse {
  data?: {
    search?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<SearchNode | null>;
    };
  } | null;
  errors?: Array<{ type?: string; message?: string }>;
}

export async function fetchSearchPage(
  token: string,
  query: string,
  after: string | null,
  withProjects: boolean,
): Promise<SearchPage> {
  let res: Response;
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NOSION',
      },
      body: JSON.stringify({
        query: searchGraphQL(withProjects),
        variables: { q: query, after, first: SEARCH_PAGE_SIZE },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    throw new GitHubSyncError('unreachable', (err as Error).message);
  }
  if (res.status === 401) throw new GitHubSyncError('revoked', 'GitHub ตอบ 401');
  const body = (await res.json().catch(() => ({}))) as GraphQLResponse & { message?: string };
  if (res.status === 403 || res.status === 429) {
    const limited = res.status === 429 || res.headers.get('x-ratelimit-remaining') === '0';
    throw new GitHubSyncError(limited ? 'rate_limited' : 'forbidden', body.message ?? '');
  }
  if (!res.ok) throw new GitHubSyncError(`http_${res.status}`, body.message ?? '');

  const search = body.data?.search;
  if (!search) {
    const first = body.errors?.[0];
    if (first?.type === 'RATE_LIMITED')
      throw new GitHubSyncError('rate_limited', first.message ?? '');
    throw new GitHubSyncError('forbidden', first?.message ?? 'ไม่มีผลค้นหา');
  }
  // error บางส่วน (เช่น repo ของ org ที่บังคับ SAML) → node นั้นเป็น null แต่ที่เหลือใช้ได้
  return {
    issues: search.nodes.flatMap((n) => {
      const issue = n ? toIssue(n) : null;
      return issue ? [issue] : [];
    }),
    endCursor: search.pageInfo.endCursor,
    hasNextPage: search.pageInfo.hasNextPage,
  };
}
