import { createServer, type Server } from 'node:http';
import type { Registry } from 'prom-client';

export interface HealthChecks {
  /** DB / Redis ต่อติดไหม — โยน error = ไม่พร้อม */
  ready: () => Promise<void>;
}

/**
 * HTTP เล็ก ๆ ของ worker — worker ไม่รับ traffic แต่ต้องมีให้:
 *  - /metrics  Prometheus (Fly.io scrape ได้เอง · สเปก 14.3)
 *  - /healthz  process ยังอยู่ (liveness → รีสตาร์ทถ้าไม่ตอบ)
 *  - /readyz   DB + Redis ต่อติด (สเปก 14.5 — แยกจาก liveness: DB กระตุกไม่ควรทำให้ worker ถูกฆ่า)
 */
export function startServer(port: number, registry: Registry, checks: HealthChecks): Server {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(await registry.metrics());
      } else if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: Math.round(process.uptime()) }));
      } else if (req.url === '/readyz') {
        try {
          await checks.ready();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ready: true }));
        } catch (err) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ready: false, error: (err as Error).message }));
        }
      } else {
        res.writeHead(404).end();
      }
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.listen(port);
  return server;
}
