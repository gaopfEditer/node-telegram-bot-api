#!/usr/bin/env node
/**
 * Gemini 服务 API（Fastify）
 * - 提示词目录: prompts/{role}.txt
 * - POST /chat 支持两种方式:
 *   1) JSON: { role, message?, files?: [{ path }|{ data, mime_type }] }
 *   2) multipart/form-data: role, message, files (上传文件)
 * - 支持 HTTP_PROXY/HTTPS_PROXY
 */
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const Fastify = require('fastify');
const rp = require('@cypress/request-promise');

require('dotenv').config();

// 代理修复（与 ws-to-telegram.js 一致）
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

const ROOT = __dirname;
const PROMPTS_DIR = path.join(ROOT, 'prompts');
const PORT = parseInt(process.env.GEMINI_SERVICE_PORT || '3860', 10);

function getPrompt(role) {
  const safe = role.replace(/[^a-z0-9_]/gi, '');
  if (!safe || safe !== role) return null;
  const p = path.join(PROMPTS_DIR, `${safe}.txt`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

function resolveFiles(files, basePath = ROOT) {
  if (!Array.isArray(files) || files.length === 0) return [];
  const parts = [];
  for (const f of files) {
    if (f.path) {
      const full = path.isAbsolute(f.path) ? f.path : path.join(basePath, f.path);
      if (!fs.existsSync(full)) continue;
      const buf = fs.readFileSync(full);
      const mime = f.mime_type || 'application/octet-stream';
      if (path.extname(full).toLowerCase() === '.png') parts.push({ mime_type: 'image/png', data: buf.toString('base64') });
      else if (path.extname(full).toLowerCase() === '.jpg' || path.extname(full).toLowerCase() === '.jpeg') parts.push({ mime_type: 'image/jpeg', data: buf.toString('base64') });
      else parts.push({ mime_type: mime, data: buf.toString('base64') });
    } else if (f.data && typeof f.data === 'string') {
      parts.push({ mime_type: f.mime_type || 'application/octet-stream', data: f.data });
    }
  }
  return parts;
}

let modelNamesCache = null;
async function getModels(key) {
  if (modelNamesCache && modelNamesCache.length > 0) return modelNamesCache;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
  try {
    const json = await rp.get({ url, json: true, timeout: 10000 });
    modelNamesCache = (json.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    const flash = modelNamesCache.filter(n => n.toLowerCase().includes('flash'));
    const other = modelNamesCache.filter(n => !n.toLowerCase().includes('flash'));
    modelNamesCache = flash.concat(other);
  } catch {
    modelNamesCache = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  }
  return modelNamesCache;
}

// 为兼容 Node 16，这里统一使用非流式调用（generateContent），不再依赖 fetch/SSE
async function callGemini(key, systemPrompt, userMessage, fileParts, wantJson = false) {
  const models = await getModels(key);
  const parts = [{ text: systemPrompt }];
  if (userMessage && userMessage.trim()) parts.push({ text: `\n\n用户输入：${userMessage.trim()}` });
  for (const fp of fileParts) {
    parts.push({ inline_data: { mime_type: fp.mime_type, data: fp.data } });
  }
  const payload = {
    contents: [{ parts }],
    generationConfig: wantJson ? { response_mime_type: 'application/json' } : {},
    tools: [{ google_search: {} }],
  };

  // 非流式：generateContent
  for (const model of models.slice(0, 6)) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    for (const withSearch of [true, false]) {
      const body = withSearch ? payload : { contents: payload.contents, generationConfig: payload.generationConfig };
      try {
        const res = await rp({ url, method: 'POST', body, json: true, timeout: 60000, resolveWithFullResponse: true });
        return { ok: true, text: res.body.candidates?.[0]?.content?.parts?.[0]?.text || '' };
      } catch (err) {
        const sc = err.statusCode || err.response?.statusCode;
        if (sc === 403 || sc === 404) break;
        if (sc === 400 && withSearch) continue;
        throw err;
      }
    }
  }
  return { ok: false, error: '所有模型均失败' };
}

/** 支持图片生成的模型（按优先级） */
const IMAGE_MODELS = [
  'gemini-2.5-flash-image',
];

/**
 * 调用 Gemini 生成图片
 * @param {string} key - API Key
 * @param {string} prompt - 图片描述
 * @param {object} options - { aspectRatio?, numberOfImages?, referenceImages? [{ mime_type, data }] }
 * @returns {Promise<{ ok: true, images: [{ mimeType, data }], text?: string } | { ok: false, error: string }>}
 */
async function callGeminiImage(key, prompt, options = {}) {
  const { aspectRatio = '1:1', referenceImages = [] } = options;
  const promptText = aspectRatio && aspectRatio !== '1:1'
    ? `Aspect ratio ${aspectRatio}. ${prompt}`
    : prompt;
  const parts = [{ text: promptText }];
  for (const img of referenceImages) {
    if (img.data) parts.push({ inline_data: { mime_type: img.mime_type || 'image/png', data: img.data } });
  }
  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      responseMimeType: 'text/plain',
    },
  };

  for (const model of IMAGE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const res = await rp({ url, method: 'POST', body: payload, json: true, timeout: 120000, resolveWithFullResponse: true });
      const body = res.body;
      const candidates = body.candidates;
      if (!candidates || !candidates[0] || !candidates[0].content) continue;
      const contentParts = candidates[0].content.parts || [];
      const images = [];
      let text = '';
      for (const part of contentParts) {
        if (part.inlineData) {
          images.push({ mimeType: part.inlineData.mimeType || 'image/png', data: part.inlineData.data });
        } else if (part.text) {
          text += part.text;
        }
      }
      if (images.length > 0) {
        return { ok: true, images, text: text.trim() || undefined };
      }
    } catch (err) {
      const sc = err.statusCode || err.response?.statusCode;
      if (sc === 403 || sc === 404) continue;
      throw err;
    }
  }
  return { ok: false, error: '无支持图片生成的模型或生成失败' };
}

async function parseMultipart(request) {
  const data = { role: '', message: '', files: [] };
  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === 'field') {
      const value = String(part.value ?? '');
      if (part.fieldname === 'role') data.role = value;
      else if (part.fieldname === 'message') data.message = value;
      else if (part.fieldname === 'prompt') data.prompt = value;
      else if (part.fieldname === 'stream') data.stream = value;
      else if (part.fieldname === 'aspectRatio' || part.fieldname === 'aspect_ratio') data.aspectRatio = value;
    } else if (part.type === 'file' || part.file) {
      const buf = await part.toBuffer();
      const mime = part.mimetype || 'application/octet-stream';
      data.files.push({ data: buf.toString('base64'), mime_type: mime });
    }
  }
  return data;
}

async function main() {
  const fastify = Fastify({ logger: false });
  await fastify.register(require('@fastify/cors'), { origin: '*' });
  await fastify.register(require('@fastify/multipart'), { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post('/image', async (request, reply) => {
    let prompt = '';
    let aspectRatio = '1:1';
    let files = [];
    const ct = (request.headers['content-type'] || '').toLowerCase();
    if (ct.includes('multipart/form-data')) {
      const data = await parseMultipart(request);
      prompt = data.prompt || data.message || '';
      aspectRatio = data.aspectRatio || data.aspect_ratio || '1:1';
      files = data.files || [];
    } else {
      const body = request.body || {};
      prompt = body.prompt || body.message || '';
      aspectRatio = body.aspectRatio || body.aspect_ratio || '1:1';
      files = body.files || [];
    }
    if (!prompt || !prompt.trim()) {
      return reply.status(400).send({ error: '缺少 prompt 参数' });
    }
    const key = (process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      return reply.status(500).send({ error: '未配置 GEMINI_API_KEY' });
    }
    try {
      const fileParts = resolveFiles(files);
      const referenceImages = fileParts.map(fp => ({ mime_type: fp.mime_type, data: fp.data }));
      const result = await callGeminiImage(key, prompt.trim(), { aspectRatio, referenceImages });
      if (!result.ok) {
        return reply.status(500).send({ error: result.error });
      }
      return reply.send({ images: result.images, text: result.text });
    } catch (e) {
      console.error('[gemini_client]', e);
      return reply.status(500).send({ error: String(e.message || e) });
    }
  });

  fastify.post('/chat', async (request, reply) => {
    let role; let message = ''; let files = []; let streamRequested = true;
    const ct = (request.headers['content-type'] || '').toLowerCase();
    if (ct.includes('multipart/form-data')) {
      const data = await parseMultipart(request);
      role = data.role;
      message = data.message;
      files = data.files;
      if (data.stream === 'false' || data.stream === '0') streamRequested = false;
    } else {
      const body = request.body || {};
      role = body.role;
      message = body.message || '';
      files = body.files || [];
      if (body.stream === false) streamRequested = false;
    }
    if (!role || typeof role !== 'string') {
      return reply.status(400).send({ error: '缺少 role 参数' });
    }
    const prompt = getPrompt(role);
    if (!prompt) {
      return reply.status(404).send({ error: `未找到角色提示词: ${role}，请在 prompts/${role}.txt 添加` });
    }
    const key = (process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      return reply.status(500).send({ error: '未配置 GEMINI_API_KEY' });
    }
    try {
      const fileParts = resolveFiles(files);
      const wantJson = role === 'k_line_analysis';
      const result = await callGemini(key, prompt, message, fileParts, wantJson);
      if (!result.ok) {
        return reply.status(500).send({ error: result.error });
      }
      return reply.send({ text: result.text });
    } catch (e) {
      console.error('[gemini_client]', e);
      return reply.status(500).send({ error: String(e.message || e) });
    }
  });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[gemini_client] Gemini 服务已启动 http://127.0.0.1:${PORT}`);
  console.log('[gemini_client] POST /chat  JSON: { role, message?, files?: [{ path }|{ data, mime_type }] } 或 multipart: role, message, files');
  console.log('[gemini_client] POST /image JSON: { prompt, aspectRatio?, files? } 或 multipart');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
