/**
 * DTO ของ endpoint เฉพาะโมดูล Task (สเปก 7.3 · v1.1)
 * GET /tasks/sidebar · GET /tasks/focus/today · POST /tasks/:id/timer/start|stop
 */

/** ตัวเลขใน sidebar หน้า Tasks — ยิงครั้งเดียวได้ครบ */
export interface TaskSidebarDto {
  smartLists: {
    /** งานที่ยังไม่เสร็จทั้งหมด */
    all: number;
    /** ไม่มีโปรเจกต์ และไม่มีวันกำหนด — งานที่ "ยังไม่ได้จัดที่" */
    inbox: number;
    /** กำหนดภายในสิ้นวันนี้ (รวมที่เลยกำหนด) ตามโซนเวลาของผู้ใช้ */
    today: number;
    /** กำหนดตั้งแต่ต้นวันนี้ถึงสิ้นวันที่ 7 */
    week: number;
    overdue: number;
  };
  /** โปรเจกต์ที่ไม่ได้ archive เรียงตาม sortOrder — count = งานที่ยังไม่เสร็จ */
  projects: { id: string; name: string; color: string; count: number }[];
  /** แท็กที่ติดกับงานที่ยังไม่เสร็จมากที่สุด 6 อันดับ */
  topTags: { id: string; name: string; count: number }[];
}

export interface FocusSessionDto {
  id: string;
  entryId: string;
  startedAt: string;
  endedAt: string | null;
  /** null ขณะยังจับเวลาอยู่ */
  durationSeconds: number | null;
}

/** การ์ด "Focus Session วันนี้ 2h 45m / 4 ชม." */
export interface FocusTodayDto {
  /** YYYY-MM-DD ตามโซนเวลาของผู้ใช้ */
  date: string;
  /** รวมรอบที่จบแล้ว + เวลาที่ผ่านไปของรอบที่กำลังจับอยู่ ณ เวลาที่ตอบ */
  totalSeconds: number;
  goalMinutes: number;
  /** จำนวนรอบที่ "จบแล้ว" วันนี้ */
  completedSessions: number;
  running: (FocusSessionDto & { entryTitle: string }) | null;
}

export interface TimerStopResultDto {
  session: FocusSessionDto;
  /** นาทีที่บวกเข้า payload.actualMinutes ของงาน */
  addedMinutes: number;
}
