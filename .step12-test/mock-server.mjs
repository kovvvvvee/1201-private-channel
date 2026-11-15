// 本地 mock /api/chat —— SSE 流式回复，不调用真实 DeepSeek API
// 控制：GET /__set?mode=ok|fail  GET /__count
import http from 'node:http';

let mode = 'ok';
let count = 0;

const REPLY = '嗯。我在听。今天过得怎么样？有什么想聊的？';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/__set') {
    mode = url.searchParams.get('mode') || 'ok';
    res.end(`mode=${mode}`);
    return;
  }
  if (url.pathname === '/__count') {
    res.end(String(count));
    return;
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    count++;
    if (mode === 'fail') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'mock fail' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    // 模拟流式：先延迟 600ms（制造 loading 状态），再分块推送
    const chunks = ['嗯。', '我在听。', '今天过得怎么样？', '有什么想聊的？'];
    setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        if (i >= chunks.length) {
          clearInterval(iv);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        res.write(`data: ${JSON.stringify({ content: chunks[i] })}\n\n`);
        i++;
      }, 150);
    }, 600);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(3001, () => console.log('mock /api/chat on :3001'));
