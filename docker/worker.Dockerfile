# syntax=docker/dockerfile:1.7
# Worker image (Fly.io) — build ทั้ง monorepo แล้ว `pnpm deploy` เฉพาะ worker ออกมาเป็นโฟลเดอร์ที่มีทุกอย่างในตัว
#
# ทำไมไม่คัดลอก node_modules ทีละส่วนแบบเดิม: pnpm เก็บ dependency ไว้ที่ node_modules ของแต่ละ package (symlink เข้า .pnpm)
# คัดลอก dist ไปไว้ที่อื่นแล้ว Node หา bullmq / @nosion/core (และ rrule / react ของมัน) ไม่เจอ
# และ install --prod ใหม่ก็ไม่มี Prisma client ที่ generate แล้ว — `pnpm deploy` + generate ในโฟลเดอร์ปลายทางแก้ทั้งหมด

FROM node:22-alpine AS base
# Prisma ต้องมี openssl ทั้งตอน generate (ตรวจเวอร์ชันเพื่อเลือก engine) และตอนรัน
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME=/pnpm
WORKDIR /app

# ── Stage 1: install + build ──────────────────────────────────────────
FROM base AS builder
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm exec prisma generate --schema apps/api/prisma/schema.prisma
RUN pnpm turbo run build --filter=@nosion/worker...

# worker + dependency production + แพ็กเกจ workspace (คัดลอกทั้งโฟลเดอร์รวม dist) → /out
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @nosion/worker deploy --prod --legacy /out
# generate client ลง node_modules ของ /out เอง (schema อยู่ที่ API — แหล่งความจริงเดียว)
RUN mkdir -p /out/prisma && cp apps/api/prisma/schema.prisma /out/prisma/ && \
    ./node_modules/.bin/prisma generate --schema /out/prisma/schema.prisma

# ── Stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init openssl curl && \
    addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nodeapp
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=nodeapp:nodejs /out ./
USER nodeapp

# /metrics · /healthz · /readyz (apps/worker/src/server.ts)
EXPOSE 9464
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:9464/healthz || exit 1

# dumb-init ส่ง SIGTERM ถึง node จริง → graceful shutdown ทำงาน (job ที่ทำค้างจบก่อน)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
