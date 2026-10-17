import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isLocale } from './config';

/** ข้อความของแต่ละภาษา — locale มาจาก segment `[locale]` ที่ middleware rewrite ไว้ */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // ค่าเริ่มต้นตอน render ฝั่ง server — วันเวลาในแอปจัดรูปแบบตามโซนของผู้ใช้เองอยู่แล้ว (lib/format.ts)
    timeZone: 'Asia/Bangkok',
  };
});
