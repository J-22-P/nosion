# Redis ส่วนตัวของ worker บน Fly.io — คิวของ BullMQ เท่านั้น (ข้อมูลจริงอยู่ใน PostgreSQL)
# ไม่ใช้ Upstash ตัวเดียวกับ API: BullMQ poll Redis ตลอดเวลา โควตาคำสั่งของแผนฟรีหมดในไม่กี่ชั่วโมง
FROM redis:7-alpine
# รหัสผ่านมาจาก secret REDIS_PASSWORD · appendonly = job ที่ค้างอยู่รอดการรีสตาร์ท
CMD ["sh", "-c", "exec redis-server --dir /data --appendonly yes --requirepass \"$REDIS_PASSWORD\" --maxmemory-policy noeviction"]
