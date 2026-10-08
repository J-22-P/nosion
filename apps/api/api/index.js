// Vercel Function: ทุก path ถูก rewrite มาที่นี่ (vercel.json) แล้วส่งต่อให้แอป Nest ที่ build ไว้ใน dist/
// ไฟล์นี้เป็น JS ล้วนโดยตั้งใจ — Nest ต้องการ emitDecoratorMetadata ซึ่งต้องคอมไพล์ด้วย tsc (nest build) ไม่ใช่ตัวคอมไพล์ของ Vercel
module.exports = require('../dist/serverless').default;
