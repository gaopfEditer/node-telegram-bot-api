#!/usr/bin/env node
/**
 * 测试用 .env 中的 GEMINI_API_KEY 分析 screenshots/chart_15m.png
 * 使用 @cypress/request（支持 HTTP_PROXY/HTTPS_PROXY 代理）
 */
const path = require('path');
const fs = require('fs');
const rp = require('@cypress/request-promise');

require('dotenv').config();

// 代理修复逻辑（与 ws-to-telegram.js 一致）
const disableProxy = process.env.NO_PROXY === '1' || process.argv.includes('--no-proxy') || process.argv.includes('-n');
if (!disableProxy) {
  ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      if (/^[\d]+$/.test(value)) {
        delete process.env[varName];
      } else if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('socks://')) {
        process.env[varName] = value.match(/^127\.0\.0\.1:/) ? `http://${value}` : `http://${value}`;
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
const IMAGE_PATH = path.join(ROOT, 'screenshots', 'chart_15m.png');

const PROMPT = `你是一个资深的加密货币技术分析师。请分析提供的 K 线图表，并严格按照 JSON 格式输出建议。
分析要求：
1. 识别当前趋势（上涨/下跌/震荡）
2. 识别关键支撑位和阻力位
3. 分析技术指标信号（MACD, RSI, Bollinger Bands 等）
4. 给出明确交易建议（Long/Short/Neutral）
5. 评估风险等级（Low/Medium/High）

输出格式必须符合以下 JSON 结构：
{
    "trend": "string",
    "support_level": "string",
    "resistance_level": "string",
    "indicators": {"macd": "string", "rsi": "string", "bb": "string"},
    "recommendation": "string",
    "risk_level": "string",
    "reasoning": "string"
}
`;

async function main() {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    console.error('[ERROR] .env 中未配置 GEMINI_API_KEY');
    process.exit(1);
  }

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`[ERROR] 图片不存在: ${IMAGE_PATH}`);
    process.exit(1);
  }

  const imgBuffer = fs.readFileSync(IMAGE_PATH);
  const imgB64 = imgBuffer.toString('base64');

  const payload = {
    contents: [{
      parts: [
        { text: PROMPT },
        {
          inline_data: {
            mime_type: 'image/png',
            data: imgB64,
          },
        },
      ],
    }],
    generationConfig: { response_mime_type: 'application/json' },
  };

  let modelNames;
  const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

  try {
    const json = await rp.get({ url: modelsUrl, json: true, timeout: 10000 });
    modelNames = (json.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''));
    const flash = modelNames.filter(n => n.toLowerCase().includes('flash'));
    const other = modelNames.filter(n => !n.toLowerCase().includes('flash'));
    modelNames = flash.concat(other);
    if (modelNames.length === 0) {
      modelNames = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
    }
  } catch {
    modelNames = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  }

  let body;
  const toTry = modelNames.slice(0, 6);

  for (const model of toTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    console.log(`[INFO] 分析图片: ${IMAGE_PATH}`);
    console.log(`[INFO] 使用模型: ${model}`);

    try {
      const res = await rp({
        url,
        method: 'POST',
        body: payload,
        json: true, // 序列化 body 为 JSON 并设置 Content-Type
        timeout: 60000,
        resolveWithFullResponse: true,
      });
      body = res.body;
      break;
    } catch (err) {
      const statusCode = err.statusCode || err.response?.statusCode;
      if (statusCode === 403 || statusCode === 404) {
        const errBody = err.error || err.response?.body;
        const errMsg = (typeof errBody === 'object' && errBody?.error?.message) || String(errBody || err.message).slice(0, 150);
        console.warn(`[WARN] ${model} ${statusCode}: ${errMsg}`);
      } else {
        throw err;
      }
    }
  }

  if (!body) {
    console.error('[ERROR] 所有模型均失败。若为 403「leaked」: 请到 https://aistudio.google.com/apikey 新建 API Key 并更新 .env');
    process.exit(1);
  }

  const text = body.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('\n[OK] 分析结果:');

  try {
    const data = JSON.parse(text);
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
