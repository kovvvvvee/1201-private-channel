// 1201 隔离移动端体验版构建配置
// 与 vite.config.js 完全独立：只额外注入一个内联 <script>，
// 在窗口期拦截 fetch('/api/chat') 并返回本地 Mock SSE 响应。
// 不修改 src/ 任何业务代码，不影响正式构建（dist/）。
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ===== Mock /api/chat（内联注入 index.html <head>，先于模块脚本执行）=====
const mockChatScript = `
(function () {
  if (window.__MOCK_CHAT_INSTALLED__) return;
  window.__MOCK_CHAT_INSTALLED__ = true;

  var origFetch = window.fetch.bind(window);
  var replyPool = [
    '嗯。我在听。今天过得怎么样？有什么想聊的？',
    '我在。你说，我听着。今天还顺利吗？',
    '记得吃饭。有什么心事都可以讲给我听。',
    '嗯。剩下的时间，我都会陪着你。'
  ];
  var replyIndex = 0;

  function sseResponse(chunks) {
    var encoder = new TextEncoder();
    var stream = new ReadableStream({
      start: function (controller) {
        var i = 0;
        setTimeout(function () {
          var timer = setInterval(function () {
            if (i >= chunks.length) {
              clearInterval(timer);
              controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
              controller.close();
              return;
            }
            controller.enqueue(encoder.encode('data: ' + JSON.stringify({ content: chunks[i] }) + '\\n\\n'));
            i++;
          }, 150);
        }, 600);
      }
    });
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/chat') !== 0) {
      return origFetch(input, init);
    }
    // 解析请求体，取最后一条 user 消息
    var lastUserText = '';
    try {
      var body = init && init.body ? JSON.parse(init.body) : {};
      var msgs = body.messages || [];
      for (var k = msgs.length - 1; k >= 0; k--) {
        if (msgs[k].role === 'user') { lastUserText = String(msgs[k].content || ''); break; }
      }
    } catch (e) {}

    // Mock 故障注入：消息包含「失败」时返回 HTTP 500，便于体验错误/重试流程
    if (lastUserText.indexOf('失败') !== -1) {
      return Promise.resolve(new Response(JSON.stringify({ error: 'mock fail' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    // 按句末标点切分并保留原标点，避免产生 "？。" 双标点
    var sentences = (replyPool[replyIndex % replyPool.length].match(/[^。！？…]+[。！？…]?/g) || [])
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    replyIndex++;
    var chunks = sentences;
    return Promise.resolve(sseResponse(chunks));
  };
})();
`

const injectMockChat = {
  name: 'inject-mock-chat',
  transformIndexHtml(html) {
    return html.replace('</head>', '<script>' + mockChatScript + '</script>\n  </head>')
  }
}

export default defineConfig({
  plugins: [react(), injectMockChat],
  build: {
    outDir: 'dist-mock'
  }
})
