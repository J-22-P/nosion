import { Text } from '@react-email/components';
import { Heading, Layout, Paragraph, PrimaryButton, Row, color } from '../layout';

/**
 * template ทั้ง 6 แบบตามสเปก 10.3 + การเตือนทางอีเมล (ช่องทาง email ของ Reminder Engine)
 * แต่ละแบบ = หัวเรื่อง + component · ข้อมูลที่ส่งเข้ามาเป็นข้อความที่จัดรูปแบบแล้ว (เงิน/วันที่)
 * template จึงไม่ต้องรู้เรื่องโซนเวลาหรือสกุลเงิน
 */

interface Common {
  settingsUrl: string;
}

// ── 1. ยืนยันอีเมล ─────────────────────────────────────
export interface VerifyEmailProps extends Common {
  link: string;
}
export const verifyEmail = {
  subject: () => 'ยืนยันอีเมลของคุณ · NOSION',
  Component: ({ link, settingsUrl }: VerifyEmailProps) => (
    <Layout preview="กดยืนยันอีเมลเพื่อเริ่มใช้ NOSION" settingsUrl={settingsUrl}>
      <Heading>ยืนยันอีเมลของคุณ</Heading>
      <Paragraph>กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ</Paragraph>
      <PrimaryButton href={link}>ยืนยันอีเมล</PrimaryButton>
      <Paragraph muted>ถ้าคุณไม่ได้สมัคร NOSION ไม่ต้องทำอะไร — บัญชีจะไม่ถูกเปิดใช้</Paragraph>
    </Layout>
  ),
};

// ── 2. ตั้งรหัสผ่านใหม่ ────────────────────────────────
export interface ResetPasswordProps extends Common {
  link: string;
  expiresMinutes: number;
}
export const resetPassword = {
  subject: () => 'ตั้งรหัสผ่านใหม่ · NOSION',
  Component: ({ link, expiresMinutes, settingsUrl }: ResetPasswordProps) => (
    <Layout
      preview={`ลิงก์ตั้งรหัสผ่านใหม่ ใช้ได้ ${expiresMinutes} นาที`}
      settingsUrl={settingsUrl}
    >
      <Heading>ตั้งรหัสผ่านใหม่</Heading>
      <Paragraph>
        มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ ลิงก์ใช้ได้ {expiresMinutes} นาทีและใช้ได้ครั้งเดียว
      </Paragraph>
      <PrimaryButton href={link}>ตั้งรหัสผ่านใหม่</PrimaryButton>
      <Paragraph muted>ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ</Paragraph>
    </Layout>
  ),
};

// ── 3. แจ้งเตือนความปลอดภัย ────────────────────────────
export interface SecurityAlertProps extends Common {
  /** เช่น "ตรวจพบการใช้ token เดิมซ้ำ" */
  reason: string;
  /** วันเวลาตามโซนผู้ใช้ */
  when: string;
}
export const securityAlert = {
  subject: () => 'ตรวจพบการใช้งานที่น่าสงสัย · NOSION',
  Component: ({ reason, when, settingsUrl }: SecurityAlertProps) => (
    <Layout preview="เราออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย" settingsUrl={settingsUrl}>
      <Heading>ตรวจพบการใช้งานที่น่าสงสัย</Heading>
      <Paragraph>
        {reason} เมื่อ {when} เราจึงออกจากระบบทุกอุปกรณ์ของบัญชีนี้เพื่อความปลอดภัย
      </Paragraph>
      <Paragraph>ถ้าไม่ใช่คุณ แนะนำให้ตั้งรหัสผ่านใหม่ทันที</Paragraph>
      <PrimaryButton href={settingsUrl}>ไปที่การตั้งค่าบัญชี</PrimaryButton>
    </Layout>
  ),
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
  subject: (p: Pick<DailyDigestProps, 'overdue' | 'today' | 'bills'>) => {
    const count = p.overdue.length + p.today.length + p.bills.length;
    return count ? `วันนี้มี ${count} เรื่องรอคุณ · NOSION` : 'วันนี้ว่าง — ไม่มีอะไรค้าง · NOSION';
  },
  Component: (p: DailyDigestProps) => {
    const empty = !p.overdue.length && !p.today.length && !p.bills.length;
    return (
      <Layout
        preview={
          empty
            ? 'ไม่มีงานหรือบิลค้างสำหรับวันนี้'
            : `${p.today.length} งานวันนี้ · ${p.bills.length} บิลใกล้ครบกำหนด`
        }
        settingsUrl={p.settingsUrl}
        unsubscribeUrl={p.unsubscribeUrl}
      >
        <Heading>อรุณสวัสดิ์ {p.name}</Heading>
        <Paragraph muted>{p.dateLabel}</Paragraph>
        {empty ? <Paragraph>วันนี้ไม่มีงานหรือบิลที่ต้องจัดการ</Paragraph> : null}
        <Group title="เลยกำหนด" items={p.overdue} tone="danger" />
        <Group title="วันนี้" items={p.today} />
        <Group title="บิลใกล้ครบกำหนด" items={p.bills} />
        <PrimaryButton href={p.appUrl}>เปิดหน้าวันนี้</PrimaryButton>
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
  subject: (p: Pick<WeeklyReviewProps, 'rangeLabel'>) => `สรุปสัปดาห์ ${p.rangeLabel} · NOSION`,
  Component: (p: WeeklyReviewProps) => (
    <Layout
      preview={`ทำเสร็จ ${p.completed} งาน · ใช้จ่าย ${p.spent}`}
      settingsUrl={p.settingsUrl}
      unsubscribeUrl={p.unsubscribeUrl}
    >
      <Heading>สรุปสัปดาห์ของ {p.name}</Heading>
      <Paragraph muted>{p.rangeLabel}</Paragraph>
      <Row label="งานที่ทำเสร็จ" value={`${p.completed} งาน`} />
      <Row label="งานที่เพิ่มใหม่" value={`${p.created} งาน`} />
      <Row label="ใช้จ่ายรวม" value={p.spent} />
      {p.topCategory ? <Row label="หมวดที่ใช้มากที่สุด" value={p.topCategory} /> : null}
      <PrimaryButton href={p.appUrl}>ดูรายละเอียด</PrimaryButton>
    </Layout>
  ),
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
  subject: (p: Pick<BudgetAlertProps, 'category' | 'percent'>) =>
    p.percent >= 100
      ? `งบ${p.category}เกินแล้ว (${p.percent}%) · NOSION`
      : `งบ${p.category}ใช้ไป ${p.percent}% แล้ว · NOSION`,
  Component: (p: BudgetAlertProps) => (
    <Layout
      preview={`ใช้ไป ${p.spent} จาก ${p.budget}`}
      settingsUrl={p.settingsUrl}
      unsubscribeUrl={p.unsubscribeUrl}
    >
      <Heading>{p.percent >= 100 ? `งบ${p.category}เกินแล้ว` : `งบ${p.category}ใกล้เต็ม`}</Heading>
      <Paragraph>
        {p.name} ใช้ไป {p.spent} จากงบ {p.budget} ({p.percent}%)
      </Paragraph>
      <PrimaryButton href={p.appUrl}>ดูหน้าการเงิน</PrimaryButton>
    </Layout>
  ),
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
  Component: (p: ReminderEmailProps) => (
    <Layout preview={p.body} settingsUrl={p.settingsUrl}>
      <Heading>{p.title}</Heading>
      <Paragraph>{p.body}</Paragraph>
      <PrimaryButton href={p.openUrl}>เปิดใน NOSION</PrimaryButton>
      <Paragraph muted>
        คุณได้รับอีเมลนี้เพราะตั้งเตือนรายการนี้ทางอีเมลไว้ — ยกเลิกการเตือนได้ในแอป
      </Paragraph>
    </Layout>
  ),
};
