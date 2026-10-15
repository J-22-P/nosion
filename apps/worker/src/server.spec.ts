import type { AddressInfo } from 'node:net';
import { Registry, Counter } from 'prom-client';
import { afterEach, describe, expect, it } from 'vitest';
import { startServer } from './server';

const servers: ReturnType<typeof startServer>[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function serve(ready: () => Promise<void>) {
  const registry = new Registry();
  new Counter({ name: 'demo_total', help: 'demo', registers: [registry] }).inc(3);
  const server = startServer(0, registry, { ready });
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
}

describe('HTTP ของ worker', () => {
  it('/metrics เป็นรูปแบบ Prometheus · /healthz 200 · path อื่น 404', async () => {
    const get = await serve(async () => undefined);
    const metrics = await get('/metrics');
    expect(metrics.headers.get('content-type')).toContain('text/plain');
    expect(await metrics.text()).toContain('demo_total 3');
    expect((await get('/healthz')).status).toBe(200);
    expect((await get('/nope')).status).toBe(404);
  });

  it('/readyz ตาม dependency — DB/Redis ล่ม = 503 แต่ /healthz ยัง 200 (ไม่ควรถูกรีสตาร์ท)', async () => {
    const get = await serve(async () => {
      throw new Error('redis ไม่ตอบ');
    });
    const ready = await get('/readyz');
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ ready: false, error: 'redis ไม่ตอบ' });
    expect((await get('/healthz')).status).toBe(200);
  });
});
