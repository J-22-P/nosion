import { type Prisma, type PrismaClient } from '@prisma/client';
import { HABIT_HISTORY_DAYS, type DemoDataset } from './demo-dataset';

/**
 * เขียน DemoDataset ของผู้ใช้หนึ่งคนลงฐาน — ใช้ทั้ง POST /auth/demo และ prisma/seed.ts
 * รับ PrismaClient ตรง ๆ (PrismaService ก็เป็น PrismaClient) จึงเรียกได้ทั้งใน Nest และสคริปต์ CLI
 * ทั้งหมดอยู่ใน transaction เดียว: ล้มกลางทาง = ไม่มีบัญชีทดลองที่ข้อมูลครึ่ง ๆ กลาง ๆ
 */
export async function seedDemo(
  prisma: PrismaClient,
  userId: string,
  data: DemoDataset,
): Promise<{
  tasks: number;
  expenses: number;
  budgets: number;
  focusSessions: number;
  habits: number;
}> {
  return prisma.$transaction(async (tx) => {
    const projectId = new Map<string, string>();
    for (const [i, p] of data.projects.entries()) {
      const row = await tx.project.create({
        data: { userId, name: p.name, color: p.color, sortOrder: i },
      });
      projectId.set(p.key, row.id);
    }
    const tagId = new Map<string, string>();
    for (const t of data.tags) {
      const row = await tx.tag.create({ data: { userId, name: t.name } });
      tagId.set(t.key, row.id);
    }

    const taskId = new Map<string, string>();
    for (const [i, t] of data.tasks.entries()) {
      const row = await tx.entry.create({
        data: {
          userId,
          module: 'task',
          title: t.title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          occurredAt: t.occurredAt,
          isAllDay: t.isAllDay,
          completedAt: t.completedAt,
          projectId: t.project ? projectId.get(t.project)! : null,
          sortOrder: i,
          payload: t.payload as Prisma.InputJsonValue,
          ...(t.tags?.length
            ? { tags: { create: t.tags.map((key) => ({ tagId: tagId.get(key)! })) } }
            : {}),
        },
      });
      taskId.set(t.key, row.id);
    }

    await tx.entry.createMany({
      data: data.expenses.map((e, i) => ({
        userId,
        module: 'expense' as const,
        title: e.title,
        status: e.status,
        occurredAt: e.occurredAt,
        isAllDay: e.isAllDay,
        completedAt: e.status === 'done' ? e.occurredAt : null,
        sortOrder: i,
        payload: e.payload as Prisma.InputJsonValue,
      })),
    });

    await tx.budget.createMany({
      data: data.budgets.map((b) => ({ userId, category: b.category, amountMinor: b.amountMinor })),
    });

    await tx.focusSession.createMany({
      data: data.focusSessions.map((f) => ({
        userId,
        entryId: taskId.get(f.task)!,
        startedAt: f.startedAt,
        endedAt: f.endedAt,
        durationSeconds: f.durationSeconds,
      })),
    });

    // นิสัย: เปิดโมดูลให้ผู้ใช้ demo แล้วสร้างกฎ + รอบที่ "materialize แล้ว" ถึงล่วงหน้า 7 วัน
    // (cron/ปุ่ม Materialize สร้างต่อเองจาก materializedUntil — เหมือนกฎที่ผู้ใช้สร้างจริง)
    const settings = await tx.userSettings.findUnique({ where: { userId } });
    const modules = new Set([
      ...(settings?.enabledModules ?? ['task', 'expense']),
      'habit' as const,
    ]);
    await tx.userSettings.update({ where: { userId }, data: { enabledModules: [...modules] } });

    for (const h of data.habits) {
      const rule = await tx.recurrenceRule.create({
        data: {
          userId,
          rrule: 'FREQ=DAILY',
          startsAt: data.habitDays[0]!,
          timezone: settings?.timezone ?? 'Asia/Bangkok',
          template: {
            module: 'habit',
            title: h.title,
            priority: 'none',
            isAllDay: true,
            payload: h.payload,
            tagIds: [],
            reminders: [],
          } as Prisma.InputJsonValue,
          materializedUntil: data.habitDays.at(-1)!,
        },
      });
      const rounds = data.habitDays.map((slot, i) => {
        const value = i <= HABIT_HISTORY_DAYS ? h.history[i] : 0; // วันข้างหน้ายังไม่ได้ทำ
        const done = value !== null && value !== undefined && value >= h.payload.targetValue;
        return {
          userId,
          module: 'habit' as const,
          title: h.title,
          status:
            value === null ? ('skipped' as const) : done ? ('done' as const) : ('pending' as const),
          occurredAt: slot,
          isAllDay: true,
          completedAt: done ? slot : null,
          recurrenceRuleId: rule.id,
          recurrenceSlot: slot,
          payload: { ...h.payload, currentValue: value ?? 0 } as Prisma.InputJsonValue,
        };
      });
      await tx.entry.createMany({ data: rounds });
    }

    return {
      habits: data.habits.length,
      tasks: data.tasks.length,
      expenses: data.expenses.length,
      budgets: data.budgets.length,
      focusSessions: data.focusSessions.length,
    };
  });
}
