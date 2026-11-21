// 特殊通讯 AI 接口：宁波大学模型平台（OpenAI Chat Completions 兼容）
// API Key 仅存于服务端环境变量 LLM_API_KEY，不出现在前端
export const maxDuration = 60; // Vercel 函数最长执行时间（秒）

const UPSTREAM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 55000;

// 每分钟限流器（实例级；Vercel 多实例下非全局，见审计报告）
const minuteRateLimiter = {
  requests: new Map(),
  maxRequests: 10,
  windowMs: 60 * 1000,
  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [clientIp, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) this.requests.delete(clientIp);
      else this.requests.set(clientIp, valid);
    }
    const list = this.requests.get(ip) || [];
    if (list.length >= this.maxRequests) return false;
    list.push(now);
    this.requests.set(ip, list);
    return true;
  }
};

const dailyRateLimiter = {
  requests: new Map(),
  maxRequests: 30,
  windowMs: 24 * 60 * 60 * 1000,
  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [clientIp, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => t > windowStart);
      if (valid.length === 0) this.requests.delete(clientIp);
      else this.requests.set(clientIp, valid);
    }
    const list = this.requests.get(ip) || [];
    if (list.length >= this.maxRequests) return false;
    list.push(now);
    this.requests.set(ip, list);
    return true;
  }
};

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

// 解析上游 SSE：行缓冲（跨 chunk 拼接）+ 流式 UTF-8 解码
// 返回 { content } 或 null（[DONE]/空行/无法解析）
function createSseParser(onContent, onDone) {
  const decoder = new TextDecoder('utf-8', { stream: true });
  let buffer = '';
  let finished = false;

  return {
    feed(chunk) {
      if (finished) return;
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          finished = true;
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onContent(content);
        } catch {
          // 忽略非 JSON 数据行
        }
      }
    },
    flush() {
      if (finished) return;
      buffer += decoder.decode();
      // 处理末尾可能残留的不完整行（尽力而为）
      const lines = buffer.split('\n');
      buffer = '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { finished = true; onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onContent(content);
        } catch { /* ignore */ }
      }
    },
    get finished() { return finished; }
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1) 环境配置检查：仅允许 LLM_API_KEY（学校平台），禁止回退旧 DeepSeek Key
  const apiKey = (process.env.LLM_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[api/chat] LLM_API_KEY 未配置');
    return res.status(500).json({ error: '服务配置错误' });
  }

  // 3) 限流（实例级）
  const clientIP = getClientIP(req);
  if (!dailyRateLimiter.check(clientIP)) {
    return res.status(429).json({ error: '今日请求次数已达上限' });
  }
  if (!minuteRateLimiter.check(clientIP)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  try {
    const { messages } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '无效的请求格式' });
    }
    if (messages.length > 20) {
      return res.status(400).json({ error: '消息数量超过限制' });
    }

    const ALLOWED_ROLES = ['system', 'user', 'assistant']; // 修复：允许 system 角色卡
    // system 角色卡（角色设定）远长于普通消息，单独放宽上限
    const MAX_MESSAGE_LENGTH = { system: 20000, user: 1000, assistant: 1000 };
    for (const msg of messages) {
      if (!msg || !ALLOWED_ROLES.includes(msg.role)) {
        return res.status(400).json({ error: '不允许的消息类型' });
      }
      if (msg.content && typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_LENGTH[msg.role]) {
        return res.status(400).json({ error: '消息长度超过限制' });
      }
    }

    // 4) SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 5) 上游调用（超时 + 客户端断开联动）
    const baseUrl = (process.env.LLM_BASE_URL || 'https://token.nbu.edu.cn/v1').replace(/\/+$/, '');
    const model = process.env.LLM_MODEL || 'deepseek-v4-flash';
    // 平台专属参数默认值；LLM_EXTRA_PARAMS(JSON) 可整体覆盖
    const defaultExtra = baseUrl.includes('deepseek.com')
      ? { thinking: { type: 'disabled' } }   // DeepSeek 官方：非思考模式
      : baseUrl.includes('nbu.edu.cn')
        ? { enable_thinking: false }         // 宁波大学平台
        : {};
    let extraParams = defaultExtra;
    try {
      if (process.env.LLM_EXTRA_PARAMS) extraParams = JSON.parse(process.env.LLM_EXTRA_PARAMS);
    } catch {
      extraParams = defaultExtra;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    res.on('close', () => controller.abort());

    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        stream: true,
        ...extraParams,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      clearTimeout(timeout);
      console.error('[api/chat] 上游错误状态:', upstream.status);
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }
    if (!upstream.body) {
      clearTimeout(timeout);
      return res.status(502).json({ error: 'AI 服务暂时不可用' });
    }

    // 6) 流式转发：保持前端 {content} + [DONE] 契约
    const reader = upstream.body.getReader();
    let clientDone = false;
    let doneSent = false;
    res.on('close', () => { clientDone = true; });

    const sendDone = () => {
      if (!clientDone && !doneSent) {
        doneSent = true;
        res.write('data: [DONE]\n\n');
      }
    };

    const parser = createSseParser(
      (content) => { if (!clientDone) res.write(`data: ${JSON.stringify({ content })}\n\n`); },
      sendDone
    );

    try {
      while (!parser.finished) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
      parser.flush();
    } catch (streamErr) {
      // 上游断流/超时/客户端断开：已写出的内容保留，干净结束
      console.error('[api/chat] 流处理异常:', streamErr?.name || streamErr);
    } finally {
      clearTimeout(timeout);
      try { reader.cancel(); } catch { /* ignore */ }
      sendDone();
      if (!clientDone && !res.writableEnded) {
        res.end();
      }
    }

  } catch (error) {
    // 诊断增强：记录网络层真实原因（cause.code/message），过滤敏感信息
    const sanitize = (v) => String(v ?? '')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replaceAll(apiKey, '[REDACTED]');
    console.error('[api/chat] Error:', sanitize(error?.name || typeof error),
      '|', sanitize(error?.message),
      '| cause:', sanitize(error?.cause?.code), sanitize(error?.cause?.message));
    if (!res.headersSent) {
      return res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
    try { res.end(); } catch { /* ignore */ }
  }
}
