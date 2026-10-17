import { Text } from '@react-email/components';
import { copyFor, type EmailLang } from '../copy';
import { Heading, Layout, Paragraph, PrimaryButton, Row, color } from '../layout';

/**
 * template ทั้ง 6 แบบตามสเปก 10.3 + การเตือนทางอีเมล (ช่องทาง email ของ Reminder Engine)
 * แต่ละแบบ = หัวเรื่อง + component · ข้อมูลที่ส่งเข้ามาเป็นข้อความที่จัดรูปแบบแล้ว (เงิน/วันที่)
 * template จึงไม่ต้องรู้เรื่องโซนเวลาหรือสกุลเงิน
 */

interface Common {
  settingsUrl: string;
  /** ภาษาของผู้รับ (settings.locale) · ไม่ส่ง = ไทย */
  lang?: EmailLang;
}

// ── 1. ยืนยันอีเมล ─────────────────────────────────────
export interface VerifyEmailProps extends Common {
  link: string;
}
export const verifyEmail = {
  subject: (p: Pick<VerifyEmailProps, 'lang'>) => copyFor(p.lang).verifySubject,
  Component: ({ link, settingsUrl, lang }: VerifyEmailProps) => {
    const c = copyFor(lang);
    return (
      <Layout preview={c.verifyPreview} settingsUrl={settingsUrl} lang={lang}>
        <Heading>{c.verifyHeading}</Heading>
        <Paragraph>{c.verifyBody}</Paragraph>
        <PrimaryButton href={link}>{c.verifyButton}</PrimaryButton>
        <Paragraph muted>{c.verifyIgnore}</Paragraph>
      </Layout>
    );
  },
};

// ── 2. ตั้งรหัสผ่านใหม่ ────────────────────────────────
export interface ResetPasswordProps extends Common {
  link: string;
  expiresMinutes: number;
}
export const resetPassword = {
  subject: (p: Pick<ResetPasswordProps, 'lang'>) => copyFor(p.lang).resetSubject,
  Component: ({ link, expiresMinutes, settingsUrl, lang }: ResetPasswordProps) => {
    const c = copyFor(lang);
    return (
      <Layout preview={c.resetPreview(expiresMinutes)} settingsUrl={settingsUrl} lang={lang}>
        <Heading>{c.resetHeading}</Heading>
        <Paragraph>{c.resetBody(expiresMinutes)}</Paragraph>
        <PrimaryButton href={link}>{c.resetButton}</PrimaryButton>
        <Paragraph muted>{c.resetIgnore}</Paragraph>
      </Layout>
    );
  },
};

// ── 3. แจ้งเตือนความปลอดภัย ────────────────────────────
export interface SecurityAlertProps extends Common {
  /** เช่น "ตรวจพบการใช้ token เดิมซ้ำ" */
  reason: string;
  /** วันเวลาตามโซนผู้ใช้ */
  when: string;
}
export const securityAlert = {
  subject: (p: Pick<SecurityAlertProps, 'lang'>) => copyFor(p.lang).securitySubject,
  Component: ({ reason, when, settingsUrl, lang }: SecurityAlertProps) => {
    const c = copyFor(lang);
    return (
      <Layout preview={c.securityPreview} settingsUrl={settingsUrl} lang={lang}>
        <Heading>{c.securityHeading}</Heading>
        <Paragraph>{c.securityBody(reason, when)}</Paragraph>
        <Paragraph>{c.securityAdvice}</Paragraph>
        <PrimaryButton href={settingsUrl}>{c.securityButton}</PrimaryButton>
      </Layout>
    );
  },
};

// ── 4. สรุปรายวัน ──────────────────────────────────────
export interface DigestItem {
  title: string;
  /** "ครบกำหนดวันนี้" / "เลยมา 2 วัน" / "฿799.00" */
  detail?: string;
}
export interface DailyDigestProps extends Common {
  name: string;
  /** "วันพฤหัสบดีที่ 15 ตุลาคม" */
  dateLabel: string;
  overdue: DigestItem[];
  today: DigestItem[];
  bills: DigestItem[];
  appUrl: string;
  unsubscribeUrl: string;
}
export const dailyDigest = {
  subject: (p: Pick<DailyDigestProps, 'overdue' | 'today' | 'bills' | 'lang'>) =>
    copyFor(p.lang).digestSubject(p.overdue.length + p.today.length + p.bills.length),
  Component: (p: DailyDigestProps) => {
    const c = copyFor(p.lang);
    const empty = !p.overdue.length && !p.today.length && !p.bills.length;
    return (
      <Layout
        preview={empty ? c.digestPreviewEmpty : c.digestPreview(p.today.length, p.bills.length)}
        settingsUrl={p.settingsUrl}
        unsubscribeUrl={p.unsubscribeUrl}
        lang={p.lang}
      >
        <Heading>{c.digestHeading(p.name)}</Heading>
        <Paragraph muted>{p.dateLabel}</Paragraph>
        {empty ? <Paragraph>{c.digestEmpty}</Paragraph> : null}
        <Group title={c.digestOverdue} items={p.overdue} tone="danger" />
        <Group title={c.digestToday} items={p.today} />
        <Group title={c.digestBills} items={p.bills} />
        <PrimaryButton href={p.appUrl}>{c.digestButton}</PrimaryButton>
      </Layout>
    );
  },
};

function Group({ title, items, tone }: { title: string; items: DigestItem[]; tone?: 'danger' }) {
  if (!items.length) return null;
  return (
    <>
      <Text
        style={{
          color: color.secondary,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.5,
          margin: '20px 0 4px',
        }}
      >
        {title} ({items.length})
      </Text>
      {items.map((item, i) => (
        <Row key={i} label={item.title} value={item.detail} tone={tone} />
      ))}
    </>
  );
}

// ── 5. สรุปสัปดาห์ ─────────────────────────────────────
export interface WeeklyReviewProps extends Common {
  name: string;
  /** "6–12 ต.ค." */
  rangeLabel: string;
  completed: number;
  created: number;
  /** "฿4,320" */
  spent: string;
  topCategory?: string;
  appUrl: string;
  unsubscribeUrl: string;
}
export const weeklyReview = {
  subject: (p: Pick<WeeklyReviewProps, 'rangeLabel' | 'lang'>) =>
    copyFor(p.lang).weeklySubject(p.rangeLabel),
  Component: (p: WeeklyReviewProps) => {
    const c = copyFor(p.lang);
    return (
      <Layout
        preview={c.weeklyPreview(p.completed, p.spent)}
        settingsUrl={p.settingsUrl}
        unsubscribeUrl={p.unsubscribeUrl}
        lang={p.lang}
      >
        <Heading>{c.weeklyHeading(p.name)}</Heading>
        <Paragraph muted>{p.rangeLabel}</Paragraph>
        <Row label={c.weeklyCompleted} value={c.weeklyTasks(p.completed)} />
        <Row label={c.weeklyCreated} value={c.weeklyTasks(p.created)} />
        <Row label={c.weeklySpent} value={p.spent} />
        {p.topCategory ? <Row label={c.weeklyTopCategory} value={p.topCategory} /> : null}
        <PrimaryButton href={p.appUrl}>{c.weeklyButton}</PrimaryButton>
      </Layout>
    );
  },
};

// ── 6. งบใกล้เกิน / เกินแล้ว ───────────────────────────
export interface BudgetAlertProps extends Common {
  name: string;
  /** "อาหาร" หรือ "งบรวม" */
  category: string;
  spent: string;
  budget: string;
  percent: number;
  appUrl: string;
  unsubscribeUrl: string;
}
export const budgetAlert = {
  subject: (p: Pick<BudgetAlertProps, 'category' | 'percent' | 'lang'>) =>
    copyFor(p.lang).budgetSubject(p.category, p.percent),
  Component: (p: BudgetAlertProps) => {
    const c = copyFor(p.lang);
    return (
      <Layout
        preview={c.budgetPreview(p.spent, p.budget)}
        settingsUrl={p.settingsUrl}
        unsubscribeUrl={p.unsubscribeUrl}
        lang={p.lang}
      >
        <Heading>{c.budgetHeading(p.category, p.percent >= 100)}</Heading>
        <Paragraph>{c.budgetBody(p.name, p.spent, p.budget, p.percent)}</Paragraph>
        <PrimaryButton href={p.appUrl}>{c.budgetButton}</PrimaryButton>
      </Layout>
    );
  },
};

// ── 7. การเตือน (ช่องทาง email) ───────────────────────
export interface ReminderEmailProps extends Common {
  title: string;
  /** "ครบกำหนดพรุ่งนี้" */
  body: string;
  openUrl: string;
}
export const reminderEmail = {
  subject: (p: Pick<ReminderEmailProps, 'title' | 'body'>) => `${p.title} — ${p.body}`,
  Component: (p: ReminderEmailProps) => {
    const c = copyFor(p.lang);
    return (
      <Layout preview={p.body} settingsUrl={p.settingsUrl} lang={p.lang}>
        <Heading>{p.title}</Heading>
        <Paragraph>{p.body}</Paragraph>
        <PrimaryButton href={p.openUrl}>{c.reminderButton}</PrimaryButton>
        <Paragraph muted>{c.reminderFooter}</Paragraph>
      </Layout>
    );
  },
};
