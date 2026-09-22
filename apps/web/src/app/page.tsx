import Link from 'next/link';
import { DemoButton } from '@/features/auth/demo-button';
import { Button } from '@/components/ui/button';

const HIGHLIGHTS = [
  {
    title: 'Plugin Architecture',
    detail: 'เพิ่มโมดูลใหม่โดยแก้โค้ดเดิม 0 บรรทัด — ทุกหน้าวนลูปบนทะเบียนโมดูล',
  },
  {
    title: 'Recurrence Engine',
    detail: 'RRULE + timezone + DST และ edge case สิ้นเดือนที่ไม่มีอยู่จริง',
  },
  {
    title: 'Reminder ที่ไม่หาย',
    detail: 'idempotent, retry, DLQ — Redis ล่มแล้วกู้กลับมายิงต่อได้',
  },
  {
    title: 'Offline-first',
    detail: 'บันทึกตอนเน็ตหลุด แล้ว sync ทีหลังพร้อมการแก้ conflict',
  },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-medium tracking-widest text-[var(--muted-foreground)]">NOSION</p>
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          ระบบจัดการชีวิตที่ต่อโมดูลเพิ่มได้
        </h1>
        <p className="max-w-xl text-[var(--muted-foreground)]">
          งาน การเงิน ออกกำลังกาย และนิสัย อยู่บนโครงสร้างข้อมูลเดียวกัน
          จึงดูรวมกันได้ในหน้าเดียวโดยไม่ต้องสลับแอป
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <DemoButton />
        <Link href="/login">
          <Button variant="outline" size="lg">
            เข้าสู่ระบบ
          </Button>
        </Link>
        <Link href="/register" className="text-sm text-[var(--muted-foreground)] underline">
          สมัครบัญชีใหม่
        </Link>
      </div>

      <section aria-labelledby="highlights" className="space-y-4">
        <h2
          id="highlights"
          className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
        >
          โจทย์ทางเทคนิคที่โปรเจกต์นี้แก้
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <li
              key={item.title}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
