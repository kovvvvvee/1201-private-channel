export default async function handler(req, res) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug 日志
  console.log("KEY存在:", !!process.env.DEEPSEEK_API_KEY);
  console.log("MODEL:", process.env.DEEPSEEK_MODEL);

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { messages } = req.body;

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
      const errorText = await response.text();
      console.error('DeepSeek API Error Status:', response.status);
      console.error('DeepSeek API Error Body:', errorText);
      return res.status(500).json({ error: `DeepSeek API Error: ${response.status} - ${errorText}` });
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
    console.error('DeepSeek API Error:', error);
    return res.status(500).json({ error: 'AI 服务暂时不可用' });
  }
}
