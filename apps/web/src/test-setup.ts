import { configureI18n } from './i18n/current';
import th from '../messages/th.json';

// ฟังก์ชันบริสุทธิ์ที่แปลข้อความ (format · builder · palette …) — เทสต์ยืนยันผลเป็นภาษาไทย · ปี ค.ศ. (ตัวเลขในเทสต์อ่านง่าย)
configureI18n({ locale: 'th', messages: th, buddhistEra: false });
