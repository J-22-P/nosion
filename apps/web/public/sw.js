/* NOSION service worker — Web Push (สเปก 10.3) + เปิดแอปตอนออฟไลน์ (สเปก 8.6 · Phase 7)
 *
 * ไฟล์ static ไม่ผ่าน bundler: เขียนเป็น JavaScript ธรรมดาที่เบราว์เซอร์รันได้ตรง ๆ
 * API อยู่ที่ไหนรับมาจาก query ตอน register (/sw.js?api=…) — ว่าง = origin เดียวกับเว็บ (staging ใช้ proxy)
 *
 * ปุ่ม "จ่ายแล้ว / เลื่อน 1 วัน" เรียก API จากเบื้องหลังโดยไม่เปิดแอป — ยืนยันตัวด้วย action token ที่มากับ push
 * (service worker ไม่มี access token เพราะหน้าเว็บเก็บไว้ใน memory เท่านั้น)
 *
 * แคช (เฉพาะ build จริง: /sw.js?cache=1)
 *  - หน้า (navigation) = network-first: ออนไลน์ได้ของสดเสมอและเก็บไว้ · ออฟไลน์ใช้ที่เก็บล่าสุด
 *  - /_next/static/* และไอคอน = cache-first: ชื่อไฟล์มี hash เนื้อหาไม่เปลี่ยน
 *  - ติดตั้งแล้วเก็บทุกหน้าของแอป + ไฟล์ที่หน้าอ้างถึงล่วงหน้า → ออฟไลน์เปิดหน้าที่ยังไม่เคยเข้าได้
 *  - ไม่แตะ API — ข้อมูลออฟไลน์มาจากแคชของ TanStack Query ใน IndexedDB (ฝั่งหน้าเว็บ) · การเขียนเข้าคิว outbox
 */
const PARAMS = new URL(self.location.href).searchParams;
const API_BASE = PARAMS.get('api') || self.location.origin;
const CACHE_ENABLED = PARAMS.get('cache') === '1';

const VERSION = 'v1';
const PAGES = `nosion-pages-${VERSION}`;
const STATIC = `nosion-static-${VERSION}`;
const APP_ROUTES = [
  '/today',
  '/tasks',
  '/expenses',
  '/expenses/analytics',
  '/calendar',
  '/habits',
  '/review',
  '/hub',
  '/settings',
  '/login',
];
const PRECACHE_EVERY_MS = 60 * 60 * 1000;
let lastPrecache = 0;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (CACHE_ENABLED) event.waitUntil(precache().catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = CACHE_ENABLED ? [PAGES, STATIC] : [];
      for (const key of await caches.keys()) {
        if (key.startsWith('nosion-') && !keep.includes(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** หน้าแอปทุกหน้า + ไฟล์ JS/CSS ที่หน้าอ้างถึง — หลัง deploy หน้าเว็บส่ง nosion:precache มาให้เก็บรุ่นใหม่ */
async function precache() {
  lastPrecache = Date.now();
  const pages = await caches.open(PAGES);
  const assets = new Set();
  for (const route of APP_ROUTES) {
    const res = await fetch(route, { credentials: 'same-origin' });
    if (!res.ok) continue;
    const html = await res.clone().text();
    await pages.put(route, res);
    // ชื่อไฟล์ของ route group มีวงเล็บ (chunks/app/(app)/tasks/page-….js) — ตัด ) ท้ายของ url(...) ใน CSS ทีหลัง
    for (const match of html.matchAll(/\/_next\/static\/[^"'\s\\]+/g)) {
      assets.add(match[0].replace(/[);,]+$/, ''));
    }
  }
  const statics = await caches.open(STATIC);
  for (const url of assets) {
    if (await statics.match(url)) continue;
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) await statics.put(url, res);
  }
}

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (
    type === 'nosion:precache' &&
    CACHE_ENABLED &&
    Date.now() - lastPrecache > PRECACHE_EVERY_MS
  ) {
    event.waitUntil(precache().catch(() => undefined));
  }
});

self.addEventListener('fetch', (event) => {
  if (!CACHE_ENABLED) return;
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request, url));
  }
  // อื่น ๆ (RSC payload ของการเปลี่ยนหน้าฝั่ง client ฯลฯ) ไปเน็ตตรง — ออฟไลน์แล้ว Next ถอยไปโหลดทั้งหน้า → มาเข้าทาง navigate
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(STATIC);
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // เก็บตาม path (ไม่รวม query) — หน้าแอปเป็น client-rendered: query เปลี่ยนแค่ตัวกรอง
    if (res.ok && res.type === 'basic') await cache.put(url.pathname, res.clone());
    return res;
  } catch {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

const OFFLINE_HTML = `<!doctype html><html lang="th"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ออฟไลน์ · NOSION</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b0b0c;color:#ededed">
<main style="max-width:28rem;padding:1.5rem;text-align:center"><h1 style="font-size:1.25rem">ออฟไลน์อยู่</h1>
<p style="color:#a1a1a1">หน้านี้ยังไม่ได้ถูกเก็บไว้ในเครื่อง — เปิดหน้าหลักแทนได้ แล้วลองหน้านี้อีกครั้งเมื่อมีเน็ต</p>
<p><a href="/today" style="color:#7aa2ff">ไปหน้าวันนี้</a></p></main></body></html>`;

/** Background Sync — เน็ตกลับมา: ปลุกแท็บที่เปิดอยู่ให้ส่งคิว (การส่งต้องใช้ access token ซึ่งอยู่ในหน้าเว็บเท่านั้น) */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'nosion-outbox') return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then((windows) => windows.forEach((client) => client.postMessage({ type: 'nosion:sync' }))),
  );
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
