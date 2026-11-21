// 临时网络探测（诊断 NBU 连接超时用，诊断完成后删除）
// 固定目标 GET https://token.nbu.edu.cn/v1/models，不发送任何凭据
import dns from 'node:dns';

const TARGET_HOST = 'token.nbu.edu.cn';
const TARGET_URL = `https://${TARGET_HOST}/v1/models`;
const PROBE_TIMEOUT_MS = 15000;

// 基础访问限制（实例级；Vercel 多实例下非全局）
const hits = new Map();
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] || 'unknown';
}
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  return false;
}

const sanitize = (v) => String(v ?? '')
  .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (rateLimited(getClientIP(req))) {
    return res.status(429).json({ error: 'rate limited' });
  }

  const result = {
    target: TARGET_URL,
    time: new Date().toISOString(),
    regionHint: process.env.VERCEL_REGION || 'unknown',
  };

  // 1) DNS 解析计时（系统解析器；失败不阻断后续探测）
  const dnsStart = performance.now();
  try {
    const addr = await dns.promises.lookup(TARGET_HOST);
    result.dns = {
      ms: Math.round(performance.now() - dnsStart),
      address: addr.address,
      family: addr.family,
    };
  } catch (e) {
    result.dns = {
      ms: Math.round(performance.now() - dnsStart),
      error: sanitize(e?.code || e?.name || 'dns error'),
    };
  }

  // 2) HTTPS GET 计时（无认证；401/403/404 均代表连接已建立）
  const httpsStart = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const upstream = await fetch(TARGET_URL, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'connectivity-probe' },
    });
    result.https = {
      ms: Math.round(performance.now() - httpsStart),
      status: upstream.status,
      statusText: upstream.statusText,
      contentType: upstream.headers.get('content-type'),
      connected: true, // 收到任何 HTTP 响应 = TCP+TLS 已建立
    };
    try { await upstream.body?.cancel(); } catch { /* ignore */ }
  } catch (e) {
    result.https = {
      ms: Math.round(performance.now() - httpsStart),
      connected: false,
      error: sanitize(e?.name || 'error'),
      causeCode: sanitize(e?.cause?.code || ''),
      causeMessage: sanitize(e?.cause?.message || e?.message || ''),
    };
  } finally {
    clearTimeout(timer);
  }

  result.totalMs = Math.round(performance.now() - dnsStart);
  return res.status(200).json(result);
}
