import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** ชื่อ security scheme ที่ Swagger UI ใช้ — ปุ่ม Authorize ใส่ key ทีเดียวใช้ได้ทุก endpoint */
const API_KEY_SCHEME = 'apiKey';

const DESCRIPTION = `
REST API ของ NOSION — Personal productivity OS

## เรียกจากสคริปต์ของคุณเอง (Public API)

1. แอป → **ตั้งค่า → API key** → สร้าง key (เลือกสิทธิ์ \`read\` และ/หรือ \`write\`) — key แสดงครั้งเดียว
2. แนบทุกคำขอ: \`Authorization: Bearer nos_…\` หรือ \`X-API-Key: nos_…\`

\`\`\`bash
curl -H "Authorization: Bearer $NOSION_API_KEY" https://<โดเมน>/api/v1/today
\`\`\`

- endpoint ที่ API key เรียกได้: entries · tasks · expenses · budgets · habits · calendar · today · review · projects · tags
  (หน้าตั้งค่า/การเข้าสู่ระบบ/การจัดการ key ต้องใช้แอปเท่านั้น — key ที่หลุดไปสร้าง key ใหม่ไม่ได้)
- \`read\` = GET · \`write\` = POST/PATCH/PUT/DELETE
- จำกัด 60 ครั้ง/นาที/key — ดู header \`RateLimit-Limit\` · \`RateLimit-Remaining\` · \`RateLimit-Reset\`
- error ทุกตัวเป็น [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457)
`.trim();

/**
 * Swagger UI ที่ `/api/v1/docs` + spec ที่ `/api/v1/openapi.json` — เปิดทุกสภาพแวดล้อม (Public API · สเปก 7.3)
 * อยู่ใต้ /api/v1 เพื่อให้เข้าผ่าน proxy ของเว็บได้ (โดเมนเดียวกับแอป)
 * สร้างเอกสารครั้งแรกที่มีคนเปิด ไม่ใช่ตอนบูต — serverless ไม่ต้องจ่ายเวลา cold start ให้หน้าที่แทบไม่มีคนเปิด
 */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('NOSION API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API key (`nos_…`)' },
      API_KEY_SCHEME,
    )
    .addSecurityRequirements(API_KEY_SCHEME)
    .build();

  let cached: ReturnType<typeof SwaggerModule.createDocument> | null = null;
  SwaggerModule.setup('docs', app, () => (cached ??= SwaggerModule.createDocument(app, config)), {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'NOSION API',
    swaggerOptions: { persistAuthorization: true },
  });
}
