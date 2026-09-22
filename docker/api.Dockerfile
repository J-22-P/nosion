# syntax=docker/dockerfile:1.7
# ── Stage 1: ติดตั้ง dependency ทั้งหมด (มี cache mount) ──────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
ENV PNPM_HOME=/pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm exec prisma generate --schema apps/api/prisma/schema.prisma
RUN pnpm turbo run build --filter=@nosion/api

# ── Stage 3: dependency เฉพาะ production ──────────────────────────────
FROM node:22-alpine AS prod-deps
RUN corepack enable
WORKDIR /app
ENV PNPM_HOME=/pnpm
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── Stage 4: runtime — เล็กที่สุด ─────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init curl && \
    addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nestjs
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder   --chown=nestjs:nodejs /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder   --chown=nestjs:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder   --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder   --chown=nestjs:nodejs /app/apps/api/prisma ./prisma

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3001/healthz || exit 1

# dumb-init ทำให้ SIGTERM ถูกส่งถึง node จริง → graceful shutdown ทำงาน
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
