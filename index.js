const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

app.post('/api/chat', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const { messages } = req.body;

        const stream = await client.chat.completions.create({
            model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
            messages: messages,
            stream: true,
        });

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

app.get('/api/test', async (req, res) => {
    try {
        const response = await client.chat.completions.create({
            model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
            messages: [{ role: 'user', content: '说"OK"' }],
            max_tokens: 5,
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
    console.log(`📦 使用模型: ${process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'}`);
});