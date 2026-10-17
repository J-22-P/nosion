import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { IBM_Plex_Sans_Thai, Inter, JetBrains_Mono } from 'next/font/google';
import '@nosion/ui/tokens.css';
import '../globals.css';
import { isLocale, LOCALES } from '@/i18n/config';
import { LocaleBridge } from '@/i18n/locale-bridge';
import { Providers } from '../providers';

// ฟอนต์ self-host ผ่าน next/font (8.7.3) — Inter ทั้งสองธีม, ไทยตกไปที่ IBM Plex Sans Thai
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const plexThai = IBM_Plex_Sans_Thai({
  // เฉพาะชุดอักษรไทย — ตัวละตินใช้ Inter (อยู่ก่อนใน font stack) ชุด latin ของ Plex จึงไม่เคยถูกใช้
  // ตัดแล้วไฟล์ที่ preload หน้าแรกลด 4 ไฟล์ (Lighthouse LCP มือถือ · Phase 8 ขั้น 2)
  subsets: ['thai'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-thai',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  // ใช้กับ chip/ตัวเลขเล็ก ๆ — ไม่ต้องแย่งเน็ตตอนโหลดหน้าแรก (ยังโหลดเมื่อหน้าต้องใช้)
  preload: false,
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

/** สร้างล่วงหน้าทั้งสองภาษา — middleware เลือกชุดตามคุกกี้ (i18n/config.ts) */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: 'NOSION', template: '%s · NOSION' },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${plexThai.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Bangkok">
          <LocaleBridge />
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
