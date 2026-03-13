/**
 * WebSocket 消息监听并转发到 Telegram 群组
 * 
 * 功能：
 * 1. 连接到 WebSocket: wss://bz.a.gaopf.top/api/ws
 * 2. 监听消息并解析
 * 3. 将消息转发到 Telegram 群组（默认: -5279508223）
 * 
 * 使用方法：
 * 1. 在 .env 文件中配置：
 *    - TEST_TELEGRAM_TOKEN: 机器人 Token
 *    - TARGET_GROUP_ID: 目标群组 ID（默认: -5279508223）
 * 
 * 2. 运行: node ws-to-telegram.js
 * 
 * 3. 可选参数：
 *    --chat-id <ID> : 指定目标群组 ID
 *    --no-proxy     : 禁用代理
 */

// 加载环境变量
require('dotenv').config();

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

// 如果没有通过命令行指定，则从环境变量获取，默认使用 -5279508223
if (!targetChatId) {
  if (process.env.TARGET_GROUP_ID) {
    targetChatId = parseInt(process.env.TARGET_GROUP_ID, 10);
  } else {
    targetChatId = -5279508223; // 默认群组 ID
  }
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

// 配置代理（如果不禁用）
if (disableProxy) {
  botOptions.request.proxy = false;
  console.log('ℹ️  已禁用代理，使用直连\n');
} else {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const proxyUrl = httpsProxy || httpProxy;

  if (proxyUrl) {
    botOptions.request.proxy = proxyUrl;
    console.log(`ℹ️  使用代理连接 Telegram: ${proxyUrl}\n`);
  } else {
    console.log('ℹ️  未检测到代理配置，使用直连\n');
  }
}

const bot = new TelegramBot(TOKEN, botOptions);

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
async function sendToTelegram(message) {
  try {
    const sentMessage = await bot.sendMessage(targetChatId, message, {
      parse_mode: 'Markdown'
    });
    console.log(`✅ 消息已转发到 Telegram (消息 ID: ${sentMessage.message_id})`);
    return sentMessage;
  } catch (error) {
    console.error('❌ 转发消息到 Telegram 失败:', error.message);
    if (error.response) {
      console.error('   错误详情:', JSON.stringify(error.response.body, null, 2));
    }
    throw error;
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
  console.log('✅ 已退出');
  process.exit(0);
});

// 启动连接
console.log('🚀 WebSocket 到 Telegram 转发服务启动');
console.log(`   目标群组 ID: ${targetChatId}`);
console.log(`   WebSocket URL: ${WS_URL}\n`);

connectWebSocket();

