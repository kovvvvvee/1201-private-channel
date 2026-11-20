// 访问口令登录与会话签发（1201 特殊通讯频道保护）
// 会话 = HMAC-SHA256 签名的 HttpOnly Cookie，不落 localStorage
import crypto from 'crypto';

const COOKIE_NAME = 'nbu_session';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 小时
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

// 登录失败限流（实例级；Vercel 多实例下非全局，见审计报告）
const failLog = new Map();

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

function loginAllowed(ip) {
  const now = Date.now();
  const fails = (failLog.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  failLog.set(ip, fails);
  return fails.length < LOGIN_MAX_FAILS;
}

function recordLoginFail(ip) {
  const fails = failLog.get(ip) || [];
  fails.push(Date.now());
  failLog.set(ip, fails);
}

function clearLoginFails(ip) {
  failLog.delete(ip);
}

// 同源校验：携带 Origin 时其 host 必须与请求 host 一致（防 CSRF）
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 非浏览器客户端无 Origin，放行（SameSite=Strict 兜底）
  try {
    const o = new URL(origin);
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    return o.host === host;
  } catch {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function makeSessionToken(secret) {
  const payload = b64url(JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + TTL_MS,
    n: crypto.randomBytes(8).toString('hex'),
  }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token, secret) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return false;
    const expected = sign(payload, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

// 供 api/chat.js 复用的会话校验（同文件内复制实现，避免 api/ 子路径被当作端点）
export function getSessionFromRequest(req) {
  const secret = process.env.CHAT_SESSION_SECRET;
  if (!secret) return { ok: false, reason: 'no-secret' };
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return { ok: false, reason: 'no-cookie' };
  return verifySessionToken(token, secret)
    ? { ok: true }
    : { ok: false, reason: 'invalid' };
}

function passwordMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function setSessionCookie(res, token, maxAgeSeconds) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`);
}

export default async function handler(req, res) {
  const secret = process.env.CHAT_SESSION_SECRET;
  const expectedPassword = process.env.CHAT_ACCESS_PASSWORD;
  if (!secret || !expectedPassword) {
    return res.status(500).json({ error: '服务配置错误' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isSameOrigin(req)) {
    return res.status(403).json({ error: '请求来源无效' });
  }

  // GET：查询会话状态
  if (req.method === 'GET') {
    const session = getSessionFromRequest(req);
    return res.status(200).json({ authenticated: session.ok });
  }

  // DELETE：注销会话
  if (req.method === 'DELETE') {
    setSessionCookie(res, '', 0);
    return res.status(200).json({ ok: true });
  }

  // POST：口令登录
  if (req.method === 'POST') {
    const ip = getClientIP(req);
    if (!loginAllowed(ip)) {
      return res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || !passwordMatches(password, expectedPassword)) {
      recordLoginFail(ip);
      return res.status(401).json({ error: '口令不正确' });
    }

    clearLoginFails(ip);
    const token = makeSessionToken(secret);
    setSessionCookie(res, token, TTL_MS / 1000);
    return res.status(200).json({ ok: true, authenticated: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
