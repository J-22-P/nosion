## Summary

<!-- แผนภาพ / diff / call tree ที่เล็กที่สุดที่อธิบายการเปลี่ยนแปลงได้ -->

## Evidence

- **Before:** <!-- ภาพหน้าจอ / output / เทสต์ที่ fail -->
  **After:** <!-- ภาพหน้าจอ / output / เทสต์ที่ผ่าน -->

## Merge Danger

**Door:** <!-- one-way หรือ two-way -->

**Blast Radius:** <!-- คำเดียว เช่น none / web / api / db -->

## Checklist

- [ ] branch `feature/*` แตกจาก `develop` และ PR นี้ merge เข้า `develop`
- [ ] `pnpm lint` · `pnpm typecheck` · `pnpm test` ผ่านในเครื่อง
- [ ] CI บน PR นี้เขียว
