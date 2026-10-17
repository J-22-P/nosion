/**
 * ข้อความที่เซิร์ฟเวอร์สร้างให้ผู้ใช้อ่าน (การ์ด Today · สรุปสัปดาห์ · standup · การแจ้งเตือน) — สเปก 8.9 ไทย + อังกฤษ
 * เว็บมีพจนานุกรมของตัวเอง (apps/web/messages) · ที่นี่เฉพาะข้อความที่ API/worker ประกอบเอง
 *
 * EN ประกาศเป็น Record<keyof typeof TH> → key ที่ภาษาหนึ่งขาด = TypeScript ไม่ยอม compile
 * ค่าเป็นฟังก์ชันได้ (พหูพจน์ภาษาอังกฤษ · ไวยากรณ์ที่แทนค่าตรง ๆ ไม่ได้)
 */
export type Lang = 'th' | 'en';
type Vars = Record<string, string | number>;
type Message = string | ((v: Vars) => string);

const plural = (n: number | string, one: string, other: string) =>
  `${n} ${Number(n) === 1 ? one : other}`;

const TH = {
  'greeting.morning': 'สวัสดีตอนเช้า {name}',
  'greeting.afternoon': 'สวัสดีตอนบ่าย {name}',
  'greeting.evening': 'สวัสดีตอนเย็น {name}',

  // ── งาน ──
  'task.calendar.complete': 'ทำเสร็จ',
  'task.today.title': 'งานวันนี้',
  'task.today.headline': 'งานวันนี้ {count} ชิ้น',
  'task.today.overdueSuffix': ' · เลยกำหนด {count}',
  'task.today.subline': 'เสร็จแล้ว {done}/{total}',
  'task.today.standup': 'สร้าง standup',
  'task.today.overdue': 'เลยกำหนด',
  'task.today.empty': 'เพิ่มงานแรก',
  'task.week.title': 'งาน',
  'task.week.closed': 'ปิดงานได้ {count} รายการ',
  'task.week.mostDeferred': 'งานที่ผัดบ่อยที่สุด: "{title}" ({count} ครั้ง)',
  'task.week.done': 'ทำเสร็จ',
  'task.week.estimated': 'เวลาที่ประเมิน',
  'task.week.actual': 'เวลาที่ใช้จริง',
  'task.week.hours': '{n} ชม.',
  'standup.waitingFor': 'รอ: {items}',
  'standup.overdue': 'เลยกำหนด',
  'standup.none': 'ไม่มี',

  // ── การเงิน ──
  'expense.calendar.paid': 'จ่ายแล้ว',
  'expense.today.title': 'การเงินและงบประมาณ',
  'expense.today.month': 'เดือนนี้ {spent}',
  'expense.today.monthBudget': 'เดือนนี้ {spent} / {budget}',
  'expense.today.headline': 'วันนี้ใช้ {spent} · {month}',
  'expense.today.overBudget': 'เดือนนี้ใช้เกินงบรวมแล้ว',
  'expense.today.categoryOver': 'หมวด{category}เกินงบ {pct}%',
  'expense.today.categoryWarning': 'หมวด{category}ใช้ไป {pct}% ของงบแล้ว',
  'expense.today.empty': 'บันทึกรายจ่ายแรก',
  'expense.due.overdue': 'เลยกำหนด {days} วัน',
  'expense.due.today': 'ครบกำหนดวันนี้',
  'expense.due.tomorrow': 'ครบกำหนดพรุ่งนี้',
  'expense.due.inDays': 'ครบกำหนดอีก {days} วัน',
  'expense.week.title': 'การเงิน',
  'expense.week.topCategory': 'ใช้กับ{category}มากที่สุด {amount} ({pct}%)',
  'expense.week.spent': 'รายจ่าย',
  'expense.week.income': 'รายรับ',
  'expense.week.count': 'จำนวนรายการ',
  'category.food': 'อาหาร',
  'category.transport': 'เดินทาง',
  'category.housing': 'ที่พัก',
  'category.utilities': 'สาธารณูปโภค',
  'category.health': 'สุขภาพ',
  'category.entertainment': 'บันเทิง',
  'category.shopping': 'ช้อปปิ้ง',
  'category.education': 'การศึกษา',
  'category.subscription': 'สมาชิกรายเดือน',
  'category.debt': 'หนี้สิน',
  'category.savings': 'เงินออม',
  'category.other': 'อื่น ๆ',

  // ── นิสัย ──
  'habit.calendar.log': 'บันทึกจำนวน',
  'habit.calendar.done': 'สำเร็จ',
  'habit.today.title': 'นิสัย',
  'habit.today.headline': 'ทำแล้ว {done} จาก {total}',
  'habit.today.none': 'วันนี้ไม่มีนิสัยที่ต้องทำ',
  'habit.today.empty': 'สร้างนิสัยแรก',
  'habit.week.title': 'นิสัย',
  'habit.week.best': 'ทำสม่ำเสมอที่สุด: {title} ({done}/{total})',
  'habit.week.worst': 'ควรใส่ใจ: {title} ({done}/{total})',
  'habit.week.done': 'ทำสำเร็จ',
  'habit.week.rate': 'อัตราความสำเร็จ',
  'habit.week.count': 'จำนวนนิสัย',

  // ── การแจ้งเตือน (push / อีเมลเตือน / สรุปรายวัน) ──
  'notify.overdue': 'เลยกำหนดมา {days} วัน',
  'notify.dueToday': 'ครบกำหนดวันนี้',
  'notify.atTime': 'ถึงเวลา {time}',
  'notify.dueTomorrow': 'ครบกำหนดพรุ่งนี้',
  'notify.tomorrowAt': 'พรุ่งนี้ {time}',
  'notify.dueOn': 'ครบกำหนด {date}',
  'notify.onAt': '{date} {time}',
  'notify.actionPaid': 'จ่ายแล้ว',
  'notify.actionDone': 'เสร็จแล้ว',
  'notify.actionDefer': 'เลื่อน 1 วัน',
} satisfies Record<string, Message>;

export type TextKey = keyof typeof TH;

const EN: Record<TextKey, Message> = {
  'greeting.morning': 'Good morning, {name}',
  'greeting.afternoon': 'Good afternoon, {name}',
  'greeting.evening': 'Good evening, {name}',

  'task.calendar.complete': 'Done',
  'task.today.title': "Today's tasks",
  'task.today.headline': (v) => `${plural(v.count!, 'task', 'tasks')} today`,
  'task.today.overdueSuffix': ' · {count} overdue',
  'task.today.subline': '{done}/{total} done',
  'task.today.standup': 'Create standup',
  'task.today.overdue': 'Overdue',
  'task.today.empty': 'Add your first task',
  'task.week.title': 'Tasks',
  'task.week.closed': (v) => `Closed ${plural(v.count!, 'task', 'tasks')}`,
  'task.week.mostDeferred': (v) =>
    `Most deferred: "${v.title}" (${plural(v.count!, 'time', 'times')})`,
  'task.week.done': 'Completed',
  'task.week.estimated': 'Estimated',
  'task.week.actual': 'Actual',
  'task.week.hours': '{n} h',
  'standup.waitingFor': 'Waiting on: {items}',
  'standup.overdue': 'Overdue',
  'standup.none': 'None',

  'expense.calendar.paid': 'Paid',
  'expense.today.title': 'Money & budget',
  'expense.today.month': 'This month {spent}',
  'expense.today.monthBudget': 'This month {spent} / {budget}',
  'expense.today.headline': 'Spent {spent} today · {month}',
  'expense.today.overBudget': "You're over this month's total budget",
  'expense.today.categoryOver': '{category} is {pct}% over budget',
  'expense.today.categoryWarning': '{category} has used {pct}% of its budget',
  'expense.today.empty': 'Record your first expense',
  'expense.due.overdue': (v) => `${plural(v.days!, 'day', 'days')} overdue`,
  'expense.due.today': 'Due today',
  'expense.due.tomorrow': 'Due tomorrow',
  'expense.due.inDays': (v) => `Due in ${plural(v.days!, 'day', 'days')}`,
  'expense.week.title': 'Money',
  'expense.week.topCategory': 'Most spent on {category}: {amount} ({pct}%)',
  'expense.week.spent': 'Spent',
  'expense.week.income': 'Income',
  'expense.week.count': 'Transactions',
  'category.food': 'Food',
  'category.transport': 'Transport',
  'category.housing': 'Housing',
  'category.utilities': 'Utilities',
  'category.health': 'Health',
  'category.entertainment': 'Entertainment',
  'category.shopping': 'Shopping',
  'category.education': 'Education',
  'category.subscription': 'Subscriptions',
  'category.debt': 'Debt',
  'category.savings': 'Savings',
  'category.other': 'Other',

  'habit.calendar.log': 'Log amount',
  'habit.calendar.done': 'Done',
  'habit.today.title': 'Habits',
  'habit.today.headline': '{done} of {total} done',
  'habit.today.none': 'No habits due today',
  'habit.today.empty': 'Create your first habit',
  'habit.week.title': 'Habits',
  'habit.week.best': 'Most consistent: {title} ({done}/{total})',
  'habit.week.worst': 'Needs attention: {title} ({done}/{total})',
  'habit.week.done': 'Completed',
  'habit.week.rate': 'Success rate',
  'habit.week.count': 'Habits',

  'notify.overdue': (v) => `${plural(v.days!, 'day', 'days')} overdue`,
  'notify.dueToday': 'Due today',
  'notify.atTime': 'Now · {time}',
  'notify.dueTomorrow': 'Due tomorrow',
  'notify.tomorrowAt': 'Tomorrow {time}',
  'notify.dueOn': 'Due {date}',
  'notify.onAt': '{date} {time}',
  'notify.actionPaid': 'Paid',
  'notify.actionDone': 'Done',
  'notify.actionDefer': 'Snooze 1 day',
};

const MESSAGES: Record<Lang, Record<TextKey, Message>> = { th: TH, en: EN };

/** ข้อความตามภาษา · `{ชื่อ}` แทนด้วยค่าใน vars */
export function text(lang: Lang, key: TextKey, vars: Vars = {}): string {
  const message = MESSAGES[lang][key] ?? TH[key];
  if (typeof message === 'function') return message(vars);
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** locale ของ Intl สำหรับเงิน/ตัวเลขในข้อความของเซิร์ฟเวอร์ */
export function intlLocaleOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'th-TH';
}
