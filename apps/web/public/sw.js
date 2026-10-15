/* NOSION service worker — Web Push (สเปก 10.3)
 *
 * ไฟล์ static ไม่ผ่าน bundler: เขียนเป็น JavaScript ธรรมดาที่เบราว์เซอร์รันได้ตรง ๆ
 * API อยู่ที่ไหนรับมาจาก query ตอน register (/sw.js?api=…) — ว่าง = origin เดียวกับเว็บ (staging ใช้ proxy)
 *
 * ปุ่ม "จ่ายแล้ว / เลื่อน 1 วัน" เรียก API จากเบื้องหลังโดยไม่เปิดแอป — ยืนยันตัวด้วย action token ที่มากับ push
 * (service worker ไม่มี access token เพราะหน้าเว็บเก็บไว้ใน memory เท่านั้น)
 */
const API_BASE = new URL(self.location.href).searchParams.get('api') || self.location.origin;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'NOSION', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'NOSION', {
      body: payload.body || '',
      // tag เดียวกันต่อรายการ → ยิงซ้ำ/เตือนรอบใหม่ทับอันเดิม ไม่กองเต็มถาด
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      icon: payload.icon || '/icons/icon-192.png',
      data: payload.data || {},
      actions: payload.actions || [],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  if ((event.action === 'complete' || event.action === 'defer') && data.actionToken) {
    event.waitUntil(runAction(event.action, data, notification.tag));
    return;
  }
  event.waitUntil(openApp(data.deepLink || '/today'));
});

async function runAction(action, data, tag) {
  try {
    const res = await fetch(`${API_BASE}/api/v1/notifications/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.actionToken, action }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // แท็บที่เปิดอยู่รีเฟรชข้อมูลเอง — ไม่ต้องรอผู้ใช้กดรีโหลด
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'nosion:entries-changed' });
  } catch {
    // ทำไม่สำเร็จ (ออฟไลน์ / token หมดอายุ) — บอกผู้ใช้ และให้แตะเพื่อเปิดแอปทำเอง
    await self.registration.showNotification('ทำรายการจากการแจ้งเตือนไม่สำเร็จ', {
      body: 'แตะเพื่อเปิดแอปแล้วทำต่อ',
      tag,
      data: { deepLink: data.deepLink },
    });
  }
}

async function openApp(path) {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
      await client.focus();
      if ('navigate' in client) await client.navigate(url);
      return;
    }
  }
  await self.clients.openWindow(url);
}
