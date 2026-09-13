// 每分钟限流器（基于客户端 IP）
const minuteRateLimiter = {
  requests: new Map(),
  maxRequests: 10,      // 每分钟最多 10 次请求
  windowMs: 60 * 1000, // 时间窗口：60 秒

  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 清理过期记录
    for (const [clientIp, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(clientIp);
      } else {
        this.requests.set(clientIp, validTimestamps);
      }
    }

    // 检查当前 IP 的请求次数
    const clientRequests = this.requests.get(ip) || [];
    if (clientRequests.length >= this.maxRequests) {
      return false; // 超过限制
    }

    // 记录本次请求
    clientRequests.push(now);
    this.requests.set(ip, clientRequests);
    return true; // 允许请求
  }
};

// 每日限流器（基于客户端 IP）
const dailyRateLimiter = {
  requests: new Map(),
  maxRequests: 30,        // 每24小时最多 30 次请求
  windowMs: 24 * 60 * 60 * 1000, // 时间窗口：24 小时

  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // 清理过期记录
    for (const [clientIp, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        this.requests.delete(clientIp);
      } else {
        this.requests.set(clientIp, validTimestamps);
      }
    }

    // 检查当前 IP 的请求次数
    const clientRequests = this.requests.get(ip) || [];
    if (clientRequests.length >= this.maxRequests) {
      return false; // 超过限制
    }

    // 记录本次请求
    clientRequests.push(now);
    this.requests.set(ip, clientRequests);
    return true; // 允许请求
  }
};

// 获取客户端 IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         'unknown';
}

export default async function handler(req, res) {
  // CORS 配置：只允许特定来源
  const allowedOrigins = ['https://1201-private-channel-rcw9-dun.vercel.app'];
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 检查 API Key 是否存在
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('API Key 未配置');
    return res.status(500).json({ error: '服务配置错误' });
  }

  // 频率限制（先检查每日限制，再检查每分钟限制）
  const clientIP = getClientIP(req);
  
  // 检查每日限制
  if (!dailyRateLimiter.check(clientIP)) {
    return res.status(429).json({ error: '今日请求次数已达上限' });
  }
  
  // 检查每分钟限制
  if (!minuteRateLimiter.check(clientIP)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  try {
    const { messages } = req.body;

    // 验证请求体
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: '无效的请求格式' });
    }

    // 验证 messages 数组数量
    const MAX_MESSAGES = 20;
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: '消息数量超过限制' });
    }

    // 验证消息长度和 role
    const MAX_MESSAGE_LENGTH = 1000;
    const ALLOWED_ROLES = ['user', 'assistant'];
    
    for (const msg of messages) {
      // 验证 role
      if (!msg.role || !ALLOWED_ROLES.includes(msg.role)) {
        return res.status(400).json({ error: '不允许的消息类型' });
      }
      
      // 验证消息长度
      if (msg.content && typeof msg.content === 'string') {
        if (msg.content.length > MAX_MESSAGE_LENGTH) {
          return res.status(400).json({ error: '消息长度超过限制' });
        }
      }
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 调用 DeepSeek API（流式）
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        messages: messages,
        temperature: 0.8,
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error('DeepSeek API Error Status:', response.status);
      return res.status(500).json({ error: 'AI 服务暂时不可用' });
    }

    // 创建可读流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              res.write('data: [DONE]\n\n');
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
              }
            } catch (e) {
              // 忽略非 JSON 数据
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream processing error:', error);
    }

    res.end();

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ error: 'AI 服务暂时不可用' });
  }
}
