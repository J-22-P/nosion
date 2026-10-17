#!/usr/bin/env bash
# smoke test หลัง deploy production (deploy-production.yml)
# รันเองได้: bash scripts/smoke-production.sh https://<เว็บ> [https://<api>]
# ตรวจทางเดินที่ผู้ใช้ทุกคนต้องผ่าน: หน้าเว็บ · API ผ่าน proxy · ฐานข้อมูล/Redis พร้อม · login ใช้ได้จริง
set -euo pipefail

BASE="${1:-}"
test -n "$BASE" || { echo "::error::ต้องระบุ URL ของเว็บ (vars.PROD_WEB_URL)"; exit 1; }
BASE="${BASE%/}"
API="${2:-}"
API="${API%/}"
fail=0

check() { # $1 ชื่อ · $2 สถานะที่ยอมรับ (regex) · ที่เหลือ = อาร์กิวเมนต์ของ curl
  local name="$1" want="$2"
  shift 2
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' --retry 5 --retry-delay 5 --retry-all-errors "$@") || got=000
  if [[ "$got" =~ ^($want)$ ]]; then
    echo "✓ $name → $got"
  else
    echo "::error::$name → $got (ต้องเป็น $want)"
    fail=1
  fi
}

check "หน้าแรก" 200 "$BASE/"
check "หน้า login (ภาษาอังกฤษ · rewrite ด้วยคุกกี้)" 200 -H 'Cookie: NOSION_LOCALE=en' "$BASE/login"
check "API ผ่าน proxy · OpenAPI" 200 "$BASE/api/v1/openapi.json"
# /readyz อยู่นอก /api/v1 (ไม่ผ่าน proxy ของเว็บ) — ตรวจที่โดเมนของ API ตรง ๆ
if [ -n "$API" ]; then check "API พร้อม (DB + Redis)" 200 "$API/readyz"; fi
# บัญชีทดลอง: 200 = เปิดและสร้างได้จริง (เขียน DB ผ่าน) · 403 = ปิดไว้โดยตั้งใจ · 429 = โดน rate limit ของ IP runner
check "demo login" '200|403|429' -X POST "$BASE/api/v1/auth/demo"
check "refresh โดยไม่มีคุกกี้ต้องถูกปฏิเสธ" 401 -X POST "$BASE/api/v1/auth/refresh"

exit $fail
