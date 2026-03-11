#!/usr/bin/env node
/**
 * Qwen 通义千问服务 API（Fastify）
 * - 生文：POST /chat  OpenAI 兼容 Chat Completions（qwen-max / qwen-plus / qwen-flash）
 * - 生图：POST /image  通义万相 / Qwen-Image 文生图（wanx / qwen-image-2.0-pro）
 * - 环境变量：QWEN_API_KEY（必填）、QWEN_CHAT_BASE_URL、QWEN_IMAGE_BASE_URL
 * - 支持 HTTP_PROXY/HTTPS_PROXY
 */
const { Readable } = require('stream');
const Fastify = require('fastify');
const rp = require('@cypress/request-promise');

require('dotenv').config();

const disableProxy = process.env.NO_PROXY === '1' || process.argv.includes('--no-proxy') || process.argv.includes('-n');
if (!disableProxy) {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      if (/^[\d]+$/.test(value)) delete process.env[varName];
      else if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('socks://')) {
        process.env[varName] = `http://${value}`;
      }
      if (value.includes(':7897')) {
        process.env[varName] = (process.env[varName] || value).replace(':7897', ':7890');
      }
    }
  });
} else {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'].forEach((varName) => {
    if (process.env[varName]) delete process.env[varName];
  });
}

const PORT = parseInt(process.env.QWEN_SERVICE_PORT || '3861', 10);
const CHAT_BASE = (process.env.QWEN_CHAT_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const IMAGE_BASE = (process.env.QWEN_IMAGE_BASE_URL || 'https://dashscope.aliyuncs.com').replace(/\/$/, '');

const CHAT_MODELS = ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-flash'];
const IMAGE_MODELS = ['qwen-image-2.0-pro', 'wanx-v1', 'wanx-v2', 'wan2.5-t2i-preview', 'wan2.6-t2i'];

/**
 * 生文：Chat Completions（为兼容 Node 16，这里统一使用非流式）
 */
async function callQwenChat(key, messages, options = {}) {
  const model = options.model || 'qwen-plus';
  const url = `${CHAT_BASE}/chat/completions`;
  const body = {
    model: CHAT_MODELS.includes(model) ? model : 'qwen-plus',
    messages,
    stream: false,
  };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };

  const res = await rp({ url, method: 'POST', body, json: true, headers, timeout: 60000, resolveWithFullResponse: true });
  const text = res.body?.choices?.[0]?.message?.content ?? '';
  return { ok: true, text };
}

/**
 * 生图：文生图（异步 task + 轮询）
 */
async function callQwenImage(key, prompt, options = {}) {
  const model = options.model || 'wanx-v1';
  const size = options.size || '1024*1024';
  const n = Math.min(4, Math.max(1, options.n || 1));
  const url = `${IMAGE_BASE}/api/v1/services/aigc/text2image/image-synthesis`;
  const body = {
    model: IMAGE_MODELS.includes(model) ? model : 'wanx-v1',
    input: {
      prompt: prompt.trim(),
      ...(options.negative_prompt && { negative_prompt: options.negative_prompt }),
    },
    parameters: { size, n },
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'X-DashScope-Async': 'enable',
  };

  const createRes = await rp({ url, method: 'POST', body, json: true, headers, timeout: 30000, resolveWithFullResponse: true });
  const createData = createRes.body;
  const taskId = createData.output?.task_id || createData.task_id;
  if (!taskId) {
    throw new Error(JSON.stringify(createData) || '未返回 task_id');
  }

  const taskUrl = `${IMAGE_BASE}/api/v1/tasks/${taskId}`;
  const maxWait = 120000;
  const interval = 2000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    const taskRes = await rp.get({ url: taskUrl, json: true, headers: { Authorization: `Bearer ${key}` }, timeout: 10000 });
    const status = taskRes.output?.task_status ?? taskRes.task_status ?? taskRes.status;
    if (status === 'SUCCEEDED' || status === 'succeeded') {
      const results = taskRes.output?.results ?? taskRes.results ?? [];
      const images = [];
      for (const r of results) {
        const imgUrl = r.url ?? r.image_url;
        const b64 = r.data;
        if (b64) {
          images.push({ url: imgUrl, data: b64, mimeType: r.mime_type || 'image/png' });
          continue;
        }
        if (!imgUrl) continue;
        try {
          const imgRes = await rp.get({ url: imgUrl, encoding: null, timeout: 30000, resolveWithFullResponse: true });
          const buf = imgRes.body;
          const contentType = imgRes.headers['content-type'] || '';
          const mimeType = contentType.split(';')[0].trim() || (imgUrl.toLowerCase().includes('.png') ? 'image/png' : imgUrl.toLowerCase().includes('.webp') ? 'image/webp' : 'image/png');
          images.push({ url: imgUrl, data: buf.toString('base64'), mimeType });
        } catch (e) {
          console.warn('[qwen_client] 下载图片失败:', imgUrl, e.message);
          images.push({ url: imgUrl, data: null, mimeType: 'image/png' });
        }
      }
      return { ok: true, images };
    }
    if (status === 'FAILED' || status === 'failed') {
      const msg = taskRes.output?.message ?? taskRes.message ?? taskRes.code ?? 'FAILED';
      return { ok: false, error: String(msg) };
    }
  }
  return { ok: false, error: '生图超时' };
}

async function main() {
  const fastify = Fastify({ logger: false });
  await fastify.register(require('@fastify/cors'), { origin: '*' });

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post('/chat', async (request, reply) => {
    const key = (process.env.QWEN_API_KEY || '').trim();
    if (!key) return reply.status(500).send({ error: '未配置 QWEN_API_KEY' });
    const body = request.body || {};
    const messages = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.status(400).send({ error: '缺少 messages 数组' });
    }
    try {
      const result = await callQwenChat(key, messages, { model: body.model });
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return reply.send({ text: result.text });
    } catch (e) {
      console.error('[qwen_client]', e);
      return reply.status(500).send({ error: String(e.message || e) });
    }
  });

  fastify.post('/image', async (request, reply) => {
    const key = (process.env.QWEN_API_KEY || '').trim();
    if (!key) return reply.status(500).send({ error: '未配置 QWEN_API_KEY' });
    const body = request.body || {};
    const prompt = body.prompt || body.message || '';
    if (!prompt.trim()) return reply.status(400).send({ error: '缺少 prompt' });
    try {
      const result = await callQwenImage(key, prompt, {
        model: body.model,
        size: body.size || '1024*1024',
        n: body.n ?? 1,
        negative_prompt: body.negative_prompt,
      });
      if (!result.ok) return reply.status(500).send({ error: result.error });
      return reply.send({ images: result.images });
    } catch (e) {
      console.error('[qwen_client]', e);
      return reply.status(500).send({ error: String(e.message || e) });
    }
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[qwen_client] Qwen 服务已启动 http://127.0.0.1:${PORT}`);
  console.log('[qwen_client] POST /chat  JSON: { messages, model?, stream? }');
  console.log('[qwen_client] POST /image JSON: { prompt, model?, size?, n? }');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
