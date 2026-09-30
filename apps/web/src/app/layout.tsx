import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Inter, JetBrains_Mono } from 'next/font/google';
import '@nosion/ui/tokens.css';
import './globals.css';
import { Providers } from './providers';

// ฟอนต์ self-host ผ่าน next/font (8.7.3) — Inter ทั้งสองธีม, ไทยตกไปที่ IBM Plex Sans Thai
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-thai',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: { default: 'NOSION', template: '%s · NOSION' },
  description: 'ระบบจัดการชีวิตแบบโมดูล — งาน การเงิน ออกกำลังกาย และนิสัย ในที่เดียว',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${inter.variable} ${plexThai.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
