/**
 * WebSocket 消息监听并转发到 Telegram 群组
 *
 * 功能：
 * 1. 连接到 WebSocket: wss://bz.a.gaopf.top/api/ws
 * 2. 监听消息并解析
 * 3. 将消息转发到 Telegram 群组（由环境变量配置）
 * 4. HTTP 服务（Fastify）：按 category 路由到不同群组并格式化后发送
 *
 * 使用方法：
 * 1. 在 .env 文件中配置：
 *    - TEST_TELEGRAM_TOKEN: 机器人 Token
 *    - TARGET_GROUP_ID 或 TEST_GROUP_ID: WebSocket 默认目标群组 ID（二选一，前者优先）
 *    - TELEGRAM_CATEGORY_MAP: 可选，JSON 字符串，如 {"tradingview":"-5279508223","whisper":"-100..."}
 *      未配置时也可在项目根目录放置 telegram_category_map.json（同结构）。
 *      若两者皆无，HTTP /forward 将回退使用上述默认群组 ID。
 *    - TELEGRAM_FORWARD_PORT: HTTP 端口，默认 3861
 *    - TELEGRAM_FORWARD_DISABLE=1: 不启动 HTTP 服务
 *    - TELEGRAM_BOT_DIRECT=1: 仅 Telegram Bot API 不走 HTTP(S)_PROXY（避免代理 TLS 握手失败；
 *      WebSocket 仍可能使用系统代理，需全局禁代理请用 --no-proxy）
 *
 * 2. 运行: node ws-to-telegram.js
 *
 * 3. HTTP 转发示例：
 *    curl -X POST http://127.0.0.1:3861/forward -H "Content-Type: application/json" \
 *      -d "{\"category\":\"tradingview\",\"content\":\"{\\\"type\\\":\\\"message_received\\\",...}\"}"
 *
 * 4. 可选参数：
 *    --chat-id <ID> : 指定目标群组 ID
 *    --no-proxy     : 禁用代理
 */

// 加载环境变量
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// 检查是否要禁用代理
const disableProxy = process.env.NO_PROXY === '1' || process.argv.includes('--no-proxy') || process.argv.includes('-n');

// 检查并修复代理配置问题
if (!disableProxy) {
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
  proxyVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      if (/^[\d]+$/.test(value)) {
        console.log(`⚠️  检测到错误的代理配置 ${varName}=${value}（只有端口号），已清除`);
        delete process.env[varName];
      } else if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('socks://')) {
        if (/^127\.0\.0\.1:[\d]+$/.test(value)) {
          const fixedValue = `http://${value}`;
          console.log(`ℹ️  修复代理配置: ${varName}=${value} -> ${fixedValue}`);
          process.env[varName] = fixedValue;
        } else {
          const fixedValue = `http://${value}`;
          console.log(`ℹ️  修复代理配置: ${varName}=${value} -> ${fixedValue}`);
          process.env[varName] = fixedValue;
        }
      }
      // 自动修复 7897 端口为 7890
      if (value.includes(':7897')) {
        const fixedValue = value.replace(':7897', ':7890');
        console.log(`⚠️  检测到代理端口 7897，自动修复为 7890`);
        process.env[varName] = fixedValue;
      }
    }
  });
} else {
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];
  proxyVars.forEach(varName => {
    if (process.env[varName]) {
      delete process.env[varName];
    }
  });
  console.log('ℹ️  已禁用代理，使用直连\n');
}

const TelegramBot = require('./index.js');

// 尝试加载 ws 库
let WebSocket;
try {
  WebSocket = require('ws');
} catch (error) {
  console.error('❌ 错误：未找到 ws 库');
  console.log('\n请先安装 ws 库：');
  console.log('  npm install ws');
  console.log('  或');
  console.log('  npm install --save ws');
  process.exit(1);
}

const TOKEN = process.env.TEST_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
const WS_URL = 'wss://bz.a.gaopf.top/api/ws';

// 解析命令行参数获取目标群组 ID
let targetChatId = null;
const chatIdIndex = process.argv.indexOf('--chat-id');
if (chatIdIndex !== -1 && process.argv[chatIdIndex + 1]) {
  targetChatId = parseInt(process.argv[chatIdIndex + 1], 10);
}

// 如果没有通过命令行指定，则从环境变量读取（与测试脚本一致：支持 TEST_GROUP_ID）
if (!targetChatId) {
  const fromEnv = process.env.TARGET_GROUP_ID || process.env.TEST_GROUP_ID;
  if (fromEnv) {
    targetChatId = parseInt(String(fromEnv).trim(), 10);
  }
}

if (!targetChatId || Number.isNaN(targetChatId)) {
  console.error('❌ 错误：未配置目标群组 ID');
  console.log('\n请在 .env 中设置 TARGET_GROUP_ID 或 TEST_GROUP_ID，或使用: node ws-to-telegram.js --chat-id <群组ID>');
  process.exit(1);
}

if (!TOKEN) {
  console.error('❌ 错误：未找到机器人 Token');
  console.log('\n请在 .env 文件中设置 TEST_TELEGRAM_TOKEN');
  process.exit(1);
}

// 创建机器人实例
const botOptions = {
  polling: false,  // 不需要 polling，只用于发送消息
  request: {}
};

/** 仅 Bot API 直连：全局仍可有 HTTP_PROXY（给 Gemini 等用），避免 Telegram 经代理 TLS 失败 */
const telegramBotDirect = process.env.TELEGRAM_BOT_DIRECT === '1' || process.env.TELEGRAM_API_DIRECT === '1';

// 配置代理（如果不禁用）
if (disableProxy) {
  botOptions.request.proxy = false;
  console.log('ℹ️  已禁用代理，Telegram 使用直连\n');
} else if (telegramBotDirect) {
  botOptions.request.proxy = false;
  console.log('ℹ️  Telegram Bot API 使用直连（TELEGRAM_BOT_DIRECT=1），不经过 HTTP_PROXY/HTTPS_PROXY\n');
} else {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const proxyUrl = httpsProxy || httpProxy;

  if (proxyUrl) {
    botOptions.request.proxy = proxyUrl;
    console.log(`ℹ️  使用代理连接 Telegram: ${proxyUrl}\n`);
    console.log('ℹ️  若出现 TLS/socket 断开，可在 .env 设置 TELEGRAM_BOT_DIRECT=1 让 Telegram 直连，或运行加 --no-proxy\n');
  } else {
    console.log('ℹ️  未检测到代理配置，使用直连\n');
  }
}

const bot = new TelegramBot(TOKEN, botOptions);

const ROOT = __dirname;

/** @returns {Record<string, number>} */
function loadCategoryChatMap() {
  const empty = {};
  const envJson = (process.env.TELEGRAM_CATEGORY_MAP || '').trim();
  if (envJson) {
    try {
      const raw = JSON.parse(envJson);
      return normalizeCategoryMap(raw);
    } catch (e) {
      console.warn('[ws-to-telegram] TELEGRAM_CATEGORY_MAP JSON 无效:', e.message);
    }
  }
  const filePath = path.join(ROOT, 'telegram_category_map.json');
  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return normalizeCategoryMap(raw);
    } catch (e) {
      console.warn('[ws-to-telegram] telegram_category_map.json 无效:', e.message);
    }
  }
  return empty;
}

function normalizeCategoryMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).trim();
    if (!key) continue;
    const n = typeof v === 'number' ? v : parseInt(String(v).trim(), 10);
    if (!Number.isNaN(n)) out[key] = n;
  }
  return out;
}

const categoryChatMap = loadCategoryChatMap();

function resolveChatIdForCategory(category) {
  const cat = String(category || '').trim();
  if (!cat) return null;
  if (Object.prototype.hasOwnProperty.call(categoryChatMap, cat)) {
    return categoryChatMap[cat];
  }
  if (Object.prototype.hasOwnProperty.call(categoryChatMap, 'default')) {
    return categoryChatMap.default;
  }
  if (Object.keys(categoryChatMap).length === 0) {
    return targetChatId;
  }
  return null;
}

function parseForwardContent(content) {
  if (content == null) return null;
  if (typeof content === 'object') return content;
  const s = String(content).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return { _plainText: s };
  }
}

function wrapTradingViewEnvelope(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { type: 'message_received', message: { content: String(parsed) } };
  }
  if (parsed.type === 'message_received' && parsed.message) return parsed;
  if (parsed.message && typeof parsed.message === 'object') {
    return parsed.type ? parsed : { type: 'message_received', message: parsed.message };
  }
  return { type: 'message_received', message: parsed };
}

function buildForwardTelegramText(category, parsed) {
  const cat = String(category || '').trim();
  if (cat === 'tradingview') {
    if (parsed && typeof parsed === 'object' && parsed._plainText && !parsed.type && !parsed.message) {
      return `📊 *TradingView*\n\n${parsed._plainText}`;
    }
    return formatTVMessage(wrapTradingViewEnvelope(parsed));
  }
  if (cat === 'whisper') {
    if (parsed && typeof parsed === 'object' && parsed._plainText) return parsed._plainText;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.text === 'string') return parsed.text;
    return '🚗 发车了！';
  }
  if (parsed && typeof parsed === 'object' && parsed._plainText) {
    return parsed._plainText;
  }
  if (typeof parsed === 'string') return parsed;
  return `📨 *${cat}*\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
}

// 格式化消息内容
function formatTVMessage(data) {
  try {
    if (data.type === 'message_received' && data.message) {
      const msg = data.message;
      const metadata = msg.metadata || {};
      
      // 构建格式化的消息
      let formattedMsg = `📊 *${msg.title || msg.type || '交易信号'}*\n\n`;
      
      // 添加主要内容
      if (msg.content) {
        formattedMsg += `${msg.content}\n\n`;
      }
      
      // 添加详细信息
      if (metadata.ticker) {
        formattedMsg += `💰 *交易对*: ${metadata.ticker}\n`;
      }
      if (metadata.type) {
        formattedMsg += `📈 *类型*: ${metadata.type}\n`;
      }
      if (metadata.period) {
        formattedMsg += `⏰ *周期*: ${metadata.period}\n`;
      }
      if (metadata.time) {
        formattedMsg += `⏰ *时间*: ${metadata.time}\n`;
      }
      if (metadata.close) {
        formattedMsg += `💵 *价格*: ${metadata.close}\n`;
      }
      if (metadata.high) {
        formattedMsg += `📈 *最高*: ${metadata.high}\n`;
      }
      if (metadata.low) {
        formattedMsg += `📉 *最低*: ${metadata.low}\n`;
      }
      
      // 添加来源信息
      if (msg.sender) {
        formattedMsg += `\n👤 *来源*: ${msg.sender}`;
      }
      
      return formattedMsg;
    } else {
      // 如果不是预期的消息格式，返回原始 JSON
      return `📨 *收到消息*\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
    }
  } catch (error) {
    console.error('❌ 格式化消息失败:', error);
    return `📨 *收到消息*\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
}

// 发送消息到 Telegram
async function sendToTelegram(message, chatId = targetChatId) {
  try {
    const sentMessage = await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
    console.log(`✅ 消息已转发到 Telegram chat=${chatId} (消息 ID: ${sentMessage.message_id})`);
    return sentMessage;
  } catch (error) {
    const msg = String(error.message || error);
    console.error('❌ 转发消息到 Telegram 失败:', msg);
    if (/TLS|socket disconnected|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(msg) && !disableProxy && !telegramBotDirect) {
      console.error('   提示: 多为代理无法稳定转发 api.telegram.org 的 HTTPS，可在 .env 设置 TELEGRAM_BOT_DIRECT=1，或启动时加 --no-proxy');
    }
    if (error.response) {
      console.error('   错误详情:', JSON.stringify(error.response.body, null, 2));
    }
    throw error;
  }
}

let forwardServer = null;

async function startForwardHttpServer() {
  if (process.env.TELEGRAM_FORWARD_DISABLE === '1') {
    console.log('ℹ️  已设置 TELEGRAM_FORWARD_DISABLE=1，跳过 HTTP 转发服务\n');
    return;
  }
  const Fastify = require('fastify');
  const port = parseInt(process.env.TELEGRAM_FORWARD_PORT || '3861', 10);
  const fastify = Fastify({ logger: false });
  await fastify.register(require('@fastify/cors'), { origin: '*' });

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post('/forward', async (request, reply) => {
    const t0 = Date.now();
    const body = request.body || {};
    const category = String(body.category || '').trim();
    if (!category) {
      return reply.status(400).send({ error: '缺少 category' });
    }
    const chatId = resolveChatIdForCategory(category);
    if (chatId == null || Number.isNaN(chatId)) {
      console.warn('[ws-to-telegram] /forward 未知 category，无映射:', category);
      return reply.status(404).send({ error: `未知 category: ${category}，请在 TELEGRAM_CATEGORY_MAP 或 telegram_category_map.json 中配置` });
    }
    const parsed = parseForwardContent(body.content);
    if (parsed == null) {
      return reply.status(400).send({ error: '缺少 content 或内容为空' });
    }
    let text;
    try {
      text = buildForwardTelegramText(category, parsed);
    } catch (e) {
      console.error('[ws-to-telegram] /forward 格式化失败', category, e.message);
      return reply.status(500).send({ error: String(e.message || e) });
    }
    try {
      const sent = await sendToTelegram(text, chatId);
      const preview = String(text || '').slice(0, 150).replace(/\s+/g, ' ');
      console.log('[ws-to-telegram] /forward ok', 'ms=', Date.now() - t0, 'category=', category, 'chatId=', chatId, 'msgId=', sent.message_id, 'preview150=', preview);
      return reply.send({ ok: true, message_id: sent.message_id, chat_id: chatId, category });
    } catch (e) {
      console.warn('[ws-to-telegram] /forward fail', 'ms=', Date.now() - t0, 'category=', category, e.message);
      return reply.status(500).send({ error: String(e.message || e) });
    }
  });

  await fastify.listen({ port, host: '0.0.0.0' });
  forwardServer = fastify;
  console.log(`[ws-to-telegram] HTTP 转发已启动 http://127.0.0.1:${port}  POST /forward  GET /health`);
  if (Object.keys(categoryChatMap).length === 0) {
    console.log('[ws-to-telegram] 未配置类目映射，/forward 将使用 WebSocket 默认群组 ID 作为所有 category 的目标');
  }
}

// 连接 WebSocket
let ws = null;
let reconnectInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000; // 5秒

function connectWebSocket() {
  console.log(`🔌 正在连接 WebSocket: ${WS_URL}`);
  
  try {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('✅ WebSocket 连接成功！');
      reconnectAttempts = 0;
      console.log(`📡 开始监听消息，目标群组: ${targetChatId}\n`);
    });

    ws.on('message', async (data) => {
      try {
        console.log('[WebSocket] 收到原始消息:', data.toString());
        
        // 解析 JSON 消息
        const messageData = JSON.parse(data.toString());
        
        // 过滤心跳消息，不转发
        if (messageData.type === 'heartbeat') {
          console.log('💓 收到心跳消息，跳过转发');
          return;
        }
        
        if(messageData.message.source === 'tradingview') {
          const formattedMessage = formatTVMessage(messageData);
          await sendToTelegram(formattedMessage);
          console.log(''); // 空行分隔
        } else if(messageData.message.source === 'whisper'){
          await sendToTelegram("🚗 发车了！");
        }
        // // 格式化消息
        // const formattedMessage = formatTVMessage(messageData);
        
        // // 发送到 Telegram
        // await sendToTelegram(formattedMessage);
        // console.log(''); // 空行分隔
        
      } catch (error) {
        console.error('❌ 处理消息失败:', error.message);
        console.error('   原始数据:', data.toString());
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket 错误:', error.message);
    });

    ws.on('close', (code, reason) => {
      console.log(`⚠️  WebSocket 连接关闭 (代码: ${code}, 原因: ${reason || '未知'})`);
      
      // 尝试重连
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY * reconnectAttempts;
        console.log(`🔄 ${delay / 1000} 秒后尝试重连 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...\n`);
        
        reconnectInterval = setTimeout(() => {
          connectWebSocket();
        }, delay);
      } else {
        console.error('❌ 达到最大重连次数，停止重连');
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ 创建 WebSocket 连接失败:', error.message);
    process.exit(1);
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 正在关闭连接...');
  if (reconnectInterval) {
    clearTimeout(reconnectInterval);
  }
  if (ws) {
    ws.close();
  }
  (async () => {
    if (forwardServer) {
      try {
        await forwardServer.close();
      } catch (_) { /* ignore */ }
    }
    console.log('✅ 已退出');
    process.exit(0);
  })();
});

// 启动连接
console.log('🚀 WebSocket 到 Telegram 转发服务启动');
console.log(`   目标群组 ID: ${targetChatId}`);
console.log(`   WebSocket URL: ${WS_URL}\n`);

(async () => {
  try {
    await startForwardHttpServer();
  } catch (e) {
    console.error('❌ HTTP 转发服务启动失败:', e.message || e);
    process.exit(1);
  }
  connectWebSocket();
})();

