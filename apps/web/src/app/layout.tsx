import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import '@nosion/ui/tokens.css';
import './globals.css';
import { Providers } from './providers';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-noto-sans-thai',
});

export const metadata: Metadata = {
  title: { default: 'NOSION', template: '%s · NOSION' },
  description: 'ระบบจัดการชีวิตแบบโมดูล — งาน การเงิน ออกกำลังกาย และนิสัย ในที่เดียว',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1120' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning className={notoSansThai.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
