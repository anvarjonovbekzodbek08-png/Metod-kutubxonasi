// Simple per-user request limit, so a public site or bot cannot run up the API bill.
// Kept in memory: it resets when the server restarts, which is fine for this purpose.
const PER_HOUR = Number(process.env.REQUESTS_PER_HOUR) || 20;
const hits = new Map(); // key -> timestamps (ms) within the last hour

export function allow(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < 3600_000);
  if (recent.length >= PER_HOUR) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of hits) if (!ts.some(t => now - t < 3600_000)) hits.delete(k);
}, 600_000).unref();
