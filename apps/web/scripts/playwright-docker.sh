#!/usr/bin/env bash
# สร้าง/อัปเดตภาพ baseline ของ visual test ใน Linux container เดียวกับ CI
# (ภาพจาก macOS ใช้เทียบใน CI ไม่ได้ — ฟอนต์ render ต่างกัน)
#
#   pnpm --filter @nosion/web test:ui:docker              # อัปเดตภาพทั้งหมด
#   pnpm --filter @nosion/web test:ui:docker --grep Tasks  # เฉพาะบางเทสต์
#
# คัดลอกซอร์สเข้า container (ไม่ bind-mount ทั้ง repo) เพื่อไม่ให้ pnpm install ใน Linux
# ไปเขียนทับ node_modules ของ macOS · ส่งกลับมาเฉพาะโฟลเดอร์ __screenshots__
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SHOTS="$ROOT/apps/web/e2e/__screenshots__"
PW_VERSION="$(node -p "require('$ROOT/apps/web/package.json').devDependencies['@playwright/test']")"
mkdir -p "$SHOTS"

docker run --rm -t \
  -v "$ROOT":/src:ro \
  -v "$SHOTS":/out \
  -e CI=1 -e NEXT_TELEMETRY_DISABLED=1 \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  bash -euo pipefail -c '
    mkdir -p /work && cd /src
    tar --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=.git -cf - . | tar -C /work -xf -
    cd /work
    corepack enable
    pnpm install --frozen-lockfile
    pnpm db:generate
    pnpm turbo run build --filter=@nosion/web
    # =all: เขียนทับทุกภาพ · ค่าเริ่มต้น (changed) เขียนเฉพาะภาพที่ต่างเกิน maxDiffPixelRatio
    # → การเปลี่ยนเล็ก ๆ (สีลิงก์) จะค้างภาพเก่าไว้เงียบ ๆ
    pnpm --filter @nosion/web exec playwright test --project=ui --update-snapshots=all "$@" || true
    cp -r apps/web/e2e/__screenshots__/. /out/
  ' _ "$@"

echo "✓ อัปเดตภาพใน apps/web/e2e/__screenshots__ แล้ว — ตรวจด้วยตาก่อน commit"
