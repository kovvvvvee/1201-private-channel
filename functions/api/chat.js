export async function onRequestPost(context) {
  const { request, env } = context;

  // 设置 SSE 响应头
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const { messages } = await request.json();

    // 调用 DeepSeek API（流式）
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        messages: messages,
        temperature: 0.8,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API Error: ${response.status}`);
    }

    // 创建可读流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // 创建 TransformStream 来处理 SSE 格式
    const stream = new ReadableStream({
      async start(controller) {
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
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  break;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices[0]?.delta?.content || '';
                  if (content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                  }
                } catch (e) {
                  // 忽略非 JSON 数据
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream processing error:', error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers });

  } catch (error) {
    console.error('DeepSeek API Error:', error);
    return new Response(JSON.stringify({ error: 'AI 服务暂时不可用' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
