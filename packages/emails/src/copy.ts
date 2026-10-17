/**
 * ข้อความของอีเมลทุกฉบับ ไทย/อังกฤษ (สเปก 8.9) — ภาษาตาม settings.locale ของผู้รับ
 * EN ประกาศเป็น typeof TH → ภาษาหนึ่งขาดข้อความ = compile ไม่ผ่าน
 */
export type EmailLang = 'th' | 'en';

const TH = {
  htmlLang: 'th',
  footerSentBy: 'ส่งจาก NOSION',
  footerSettings: 'ตั้งค่าการแจ้งเตือน',
  footerUnsubscribe: 'เลิกรับอีเมลแบบนี้',

  verifySubject: 'ยืนยันอีเมลของคุณ · NOSION',
  verifyPreview: 'กดยืนยันอีเมลเพื่อเริ่มใช้ NOSION',
  verifyHeading: 'ยืนยันอีเมลของคุณ',
  verifyBody: 'กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ',
  verifyButton: 'ยืนยันอีเมล',
  verifyIgnore: 'ถ้าคุณไม่ได้สมัคร NOSION ไม่ต้องทำอะไร — บัญชีจะไม่ถูกเปิดใช้',

  resetSubject: 'ตั้งรหัสผ่านใหม่ · NOSION',
  resetPreview: (m: number) => `ลิงก์ตั้งรหัสผ่านใหม่ ใช้ได้ ${m} นาที`,
  resetHeading: 'ตั้งรหัสผ่านใหม่',
  resetBody: (m: number) =>
    `มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ ลิงก์ใช้ได้ ${m} นาทีและใช้ได้ครั้งเดียว`,
  resetButton: 'ตั้งรหัสผ่านใหม่',
  resetIgnore: 'ถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร — รหัสผ่านเดิมยังใช้ได้ตามปกติ',

  securitySubject: 'ตรวจพบการใช้งานที่น่าสงสัย · NOSION',
  securityPreview: 'เราออกจากระบบทุกอุปกรณ์เพื่อความปลอดภัย',
  securityHeading: 'ตรวจพบการใช้งานที่น่าสงสัย',
  securityBody: (reason: string, when: string) =>
    `${reason} เมื่อ ${when} เราจึงออกจากระบบทุกอุปกรณ์ของบัญชีนี้เพื่อความปลอดภัย`,
  securityAdvice: 'ถ้าไม่ใช่คุณ แนะนำให้ตั้งรหัสผ่านใหม่ทันที',
  securityButton: 'ไปที่การตั้งค่าบัญชี',
  securityReasonTokenReuse: 'ตรวจพบการใช้ token เดิมซ้ำ',

  digestSubject: (count: number) =>
    count ? `วันนี้มี ${count} เรื่องรอคุณ · NOSION` : 'วันนี้ว่าง — ไม่มีอะไรค้าง · NOSION',
  digestPreviewEmpty: 'ไม่มีงานหรือบิลค้างสำหรับวันนี้',
  digestPreview: (today: number, bills: number) => `${today} งานวันนี้ · ${bills} บิลใกล้ครบกำหนด`,
  digestHeading: (name: string) => `อรุณสวัสดิ์ ${name}`,
  digestEmpty: 'วันนี้ไม่มีงานหรือบิลที่ต้องจัดการ',
  digestOverdue: 'เลยกำหนด',
  digestToday: 'วันนี้',
  digestBills: 'บิลใกล้ครบกำหนด',
  digestButton: 'เปิดหน้าวันนี้',

  weeklySubject: (range: string) => `สรุปสัปดาห์ ${range} · NOSION`,
  weeklyPreview: (completed: number, spent: string) =>
    `ทำเสร็จ ${completed} งาน · ใช้จ่าย ${spent}`,
  weeklyHeading: (name: string) => `สรุปสัปดาห์ของ ${name}`,
  weeklyCompleted: 'งานที่ทำเสร็จ',
  weeklyCreated: 'งานที่เพิ่มใหม่',
  weeklyTasks: (n: number) => `${n} งาน`,
  weeklySpent: 'ใช้จ่ายรวม',
  weeklyTopCategory: 'หมวดที่ใช้มากที่สุด',
  weeklyButton: 'ดูรายละเอียด',

  budgetSubject: (category: string, percent: number) =>
    percent >= 100
      ? `งบ${category}เกินแล้ว (${percent}%) · NOSION`
      : `งบ${category}ใช้ไป ${percent}% แล้ว · NOSION`,
  budgetPreview: (spent: string, budget: string) => `ใช้ไป ${spent} จาก ${budget}`,
  budgetHeading: (category: string, over: boolean) =>
    over ? `งบ${category}เกินแล้ว` : `งบ${category}ใกล้เต็ม`,
  budgetBody: (name: string, spent: string, budget: string, percent: number) =>
    `${name} ใช้ไป ${spent} จากงบ ${budget} (${percent}%)`,
  budgetButton: 'ดูหน้าการเงิน',

  reminderButton: 'เปิดใน NOSION',
  reminderFooter: 'คุณได้รับอีเมลนี้เพราะตั้งเตือนรายการนี้ทางอีเมลไว้ — ยกเลิกการเตือนได้ในแอป',
};

const EN: typeof TH = {
  htmlLang: 'en',
  footerSentBy: 'Sent by NOSION',
  footerSettings: 'Notification settings',
  footerUnsubscribe: 'Unsubscribe from these emails',

  verifySubject: 'Verify your email · NOSION',
  verifyPreview: 'Verify your email to start using NOSION',
  verifyHeading: 'Verify your email',
  verifyBody: 'Press the button below to confirm this email address is yours.',
  verifyButton: 'Verify email',
  verifyIgnore:
    "If you didn't sign up for NOSION, you can ignore this — the account won't be activated.",

  resetSubject: 'Reset your password · NOSION',
  resetPreview: (m) => `Password reset link — valid for ${m} minutes`,
  resetHeading: 'Reset your password',
  resetBody: (m) =>
    `Someone asked to reset this account's password. The link works once and expires in ${m} minutes.`,
  resetButton: 'Reset password',
  resetIgnore: "If you didn't ask for this, ignore it — your current password still works.",

  securitySubject: 'Suspicious activity detected · NOSION',
  securityPreview: 'We signed you out of every device to keep your account safe',
  securityHeading: 'Suspicious activity detected',
  securityBody: (reason, when) =>
    `${reason} at ${when}, so we signed this account out of every device to keep it safe.`,
  securityAdvice: "If this wasn't you, reset your password right away.",
  securityButton: 'Go to account settings',
  securityReasonTokenReuse: 'An old sign-in token was reused',

  digestSubject: (count) =>
    count
      ? `${count} ${count === 1 ? 'thing needs' : 'things need'} you today · NOSION`
      : 'Nothing due today · NOSION',
  digestPreviewEmpty: 'No tasks or bills due today',
  digestPreview: (today, bills) =>
    `${today} ${today === 1 ? 'task' : 'tasks'} today · ${bills} ${bills === 1 ? 'bill' : 'bills'} due soon`,
  digestHeading: (name) => `Good morning, ${name}`,
  digestEmpty: 'No tasks or bills to deal with today.',
  digestOverdue: 'Overdue',
  digestToday: 'Today',
  digestBills: 'Bills due soon',
  digestButton: 'Open Today',

  weeklySubject: (range) => `Your week ${range} · NOSION`,
  weeklyPreview: (completed, spent) =>
    `${completed} ${completed === 1 ? 'task' : 'tasks'} done · ${spent} spent`,
  weeklyHeading: (name) => `${name}'s week`,
  weeklyCompleted: 'Tasks completed',
  weeklyCreated: 'Tasks added',
  weeklyTasks: (n) => `${n} ${n === 1 ? 'task' : 'tasks'}`,
  weeklySpent: 'Total spent',
  weeklyTopCategory: 'Top category',
  weeklyButton: 'See details',

  budgetSubject: (category, percent) =>
    percent >= 100
      ? `${category} budget exceeded (${percent}%) · NOSION`
      : `${category} budget ${percent}% used · NOSION`,
  budgetPreview: (spent, budget) => `${spent} of ${budget} used`,
  budgetHeading: (category, over) =>
    over ? `${category} budget exceeded` : `${category} budget almost used up`,
  budgetBody: (name, spent, budget, percent) =>
    `${name}, you've spent ${spent} of your ${budget} budget (${percent}%).`,
  budgetButton: 'Open Finance',

  reminderButton: 'Open in NOSION',
  reminderFooter:
    "You're getting this because you set an email reminder for this item — turn it off in the app.",
};

export const COPY: Record<EmailLang, typeof TH> = { th: TH, en: EN };

export const copyFor = (lang: EmailLang | undefined) => COPY[lang ?? 'th'];
