import type { EntryStatus, StandupDto, StandupItemDto } from '@nosion/contracts';

/** แท็กที่ถือว่า "ติดอยู่" (ไม่สนตัวพิมพ์) — สเปก 7.3 */
const BLOCKED_TAG = 'blocked';
const FINISHED: EntryStatus[] = ['done', 'cancelled', 'skipped'];

export interface StandupTask {
  id: string;
  title: string;
  status: EntryStatus;
  occurredAt: Date | null;
  completedAt: Date | null;
  projectName: string | null;
  tags: string[];
  /** งานที่ต้องเสร็จก่อน (EntryDependency.blocker) */
  blockers: { title: string; status: EntryStatus }[];
}

/**
 * Standup ของวันนี้ (สเปก 7.3 · 8.11.1) — pure function
 *
 *   Done    = เสร็จวันนี้
 *   Blocked = ยังไม่เสร็จ และ (มี dependency ที่ยังไม่จบ หรือมีแท็ก #blocked) — คำนวณ ไม่เก็บเป็น status
 *   Doing   = ยังไม่เสร็จที่เหลือ (กำลังทำ / กำหนดวันนี้ / เลยกำหนด)
 */
export function buildStandup(input: {
  date: string;
  todayStart: Date;
  todayEnd: Date;
  tasks: StandupTask[];
}): StandupDto {
  const { todayStart, todayEnd } = input;
  const done: StandupItemDto[] = [];
  const doing: StandupItemDto[] = [];
  const blocked: StandupItemDto[] = [];

  for (const t of input.tasks) {
    if (t.status === 'done') {
      if (t.completedAt && t.completedAt >= todayStart && t.completedAt < todayEnd) {
        done.push(item(t));
      }
      continue;
    }
    if (FINISHED.includes(t.status)) continue;

    const waitingFor = t.blockers.filter((b) => !FINISHED.includes(b.status)).map((b) => b.title);
    const taggedBlocked = t.tags.some((tag) => tag.toLowerCase() === BLOCKED_TAG);
    if (waitingFor.length > 0 || taggedBlocked) {
      blocked.push(item(t, waitingFor.length > 0 ? `รอ: ${waitingFor.join(', ')}` : '#blocked'));
      continue;
    }

    // งานในอนาคตที่ยังไม่ได้เริ่ม ไม่ใช่เรื่องของ standup วันนี้
    const relevant = t.status === 'active' || (t.occurredAt !== null && t.occurredAt < todayEnd);
    if (!relevant) continue;
    const overdue = t.occurredAt !== null && t.occurredAt < todayStart;
    doing.push(item(t, overdue ? 'เลยกำหนด' : undefined));
  }

  const result = { date: input.date, done, doing, blocked };
  return { ...result, markdown: toMarkdown(result) };
}

function item(t: StandupTask, note?: string): StandupItemDto {
  const parts = [note, t.projectName].filter((p): p is string => Boolean(p));
  return { id: t.id, title: t.title, ...(parts.length ? { note: parts.join(' · ') } : {}) };
}

/** markdown สำหรับวางใน Slack / PR — กลุ่มว่างเขียนว่า "ไม่มี" ดีกว่าหายไป (คนอ่านรู้ว่าไม่ได้ลืม) */
export function toMarkdown(s: Omit<StandupDto, 'markdown'>): string {
  const section = (heading: string, items: StandupItemDto[]) =>
    [
      `**${heading}**`,
      ...(items.length
        ? items.map((i) => `- ${i.title}${i.note ? ` _(${i.note})_` : ''}`)
        : ['- ไม่มี']),
    ].join('\n');
  return [
    `## Standup · ${s.date}`,
    section('Done', s.done),
    section('Doing', s.doing),
    section('Blocked', s.blocked),
  ].join('\n\n');
}
