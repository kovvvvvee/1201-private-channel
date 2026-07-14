const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
console.log('📁 加载的 API Key:', process.env.DEEPSEEK_API_KEY ? '✅ 已加载' : '❌ 未加载');

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// 初始化 DeepSeek 客户端
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
    console.error('错误: 未找到 DEEPSEEK_API_KEY 或 OPENAI_API_KEY 环境变量');
    process.exit(1);
}

const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: apiKey,
});

// 聊天接口
app.post('/api/chat', async (req, res) => {
    // 设置 SSE 响应头，启用流式输出
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { messages } = req.body;

        // 调用 DeepSeek API（流式）
        // 模型从环境变量读取，默认使用 deepseek-flash
        const stream = await client.chat.completions.create({
            model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
            messages: messages,
            stream: true,
        });

        // 将流式数据逐块发送给前端
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('DeepSeek API Error:', error);
        res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
});

// 测试端点
app.get('/api/test', async (req, res) => {
  try {
    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      messages: [{ role: 'user', content: '请回复"OK"表示你正常工作' }],
    });
    res.json({
      status: 'ok',
      message: 'API Key 有效',
      reply: response.choices[0].message.content
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      detail: error.response?.data || error
    });
  }
});

app.listen(port, () => {
    console.log(`🚀 后端代理服务已启动: http://localhost:${port}`);
    console.log(`📦 使用模型: ${process.env.DEEPSEEK_MODEL || 'deepseek-flash'}`);
});
