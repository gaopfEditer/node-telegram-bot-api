/**
 * 后台发送消息给机器人（机器人发送消息到群组或用户）
 *
 * 使用方法：
 * 1. 在 .env 文件中配置：
 *    - TEST_TELEGRAM_TOKEN: 机器人 Token
 *    - TARGET_GROUP_ID: 目标群组 ID（与 listen-group-messages.js 保持一致）
 *    - TARGET_CHAT_ID: 目标聊天 ID（群组 ID 或用户 ID，可选）
 *
 * 2. 运行方式（三种方式任选其一）：
 *    a) 使用环境变量: node send-message.js "要发送的消息内容"
 *    b) 使用 --chat-id 参数: node send-message.js --chat-id -5279508223 "消息内容"
 *    c) 直接指定 ID: node send-message.js -5279508223 "消息内容"
 *
 * 示例：
 *    node send-message.js "Hello, 这是一条测试消息"  (需要设置 TARGET_GROUP_ID)
 *    node send-message.js --chat-id -5279508223 "发送到指定群组"
 *    node send-message.js -5279508223 "发送到指定群组"
 */

// 加载环境变量
require('dotenv').config();

// 检查是否要禁用代理（通过环境变量 NO_PROXY 或命令行参数）
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

const TOKEN = process.env.TEST_TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error('❌ 错误：未找到机器人 Token');
  console.log('\n请在 .env 文件中设置 TEST_TELEGRAM_TOKEN');
  process.exit(1);
}

// 解析命令行参数
const args = process.argv.slice(2);
let chatId = null;
let message = null;

// 解析 --chat-id 参数
const chatIdIndex = args.indexOf('--chat-id');
if (chatIdIndex !== -1 && args[chatIdIndex + 1]) {
  chatId = parseInt(args[chatIdIndex + 1], 10);
  args.splice(chatIdIndex, 2); // 移除 --chat-id 和其值
}

// 如果没有通过命令行指定，则从环境变量获取
// 支持 TARGET_GROUP_ID（与 listen-group-messages.js 保持一致）和 TARGET_CHAT_ID
if (!chatId) {
  if (process.env.TARGET_GROUP_ID) {
    chatId = parseInt(process.env.TARGET_GROUP_ID, 10);
  } else if (process.env.TARGET_CHAT_ID) {
    chatId = parseInt(process.env.TARGET_CHAT_ID, 10);
  }
}

// 如果还没有聊天 ID，尝试将第一个参数作为聊天 ID（如果是数字）
if (!chatId && args.length > 0) {
  const firstArg = args[0];
  // 检查是否是数字（包括负数）
  if (/^-?\d+$/.test(firstArg)) {
    chatId = parseInt(firstArg, 10);
    args.shift(); // 移除第一个参数
  }
}

// 获取消息内容（剩余的参数）
message = args.join(' ').trim();

if (!chatId) {
  console.error('❌ 错误：未指定目标聊天 ID');
  console.log('\n使用方法：');
  console.log('  1. 通过环境变量: 在 .env 文件中设置 TARGET_GROUP_ID 或 TARGET_CHAT_ID');
  console.log('  2. 通过命令行参数: node send-message.js --chat-id <ID> "消息内容"');
  console.log('  3. 直接指定 ID: node send-message.js <ID> "消息内容"');
  console.log('\n示例：');
  console.log('  node send-message.js --chat-id -5279508223 "Hello, 这是一条测试消息"');
  console.log('  node send-message.js -5279508223 "Hello, 这是一条测试消息"');
  console.log('  node send-message.js "Hello, 这是一条测试消息"  (需要设置 TARGET_GROUP_ID 环境变量)');
  process.exit(1);
}

if (!message || message.trim() === '') {
  console.error('❌ 错误：未指定要发送的消息内容');
  console.log('\n使用方法：');
  console.log('  node send-message.js "消息内容"');
  console.log('  node send-message.js --chat-id <ID> "消息内容"');
  process.exit(1);
}

// 创建机器人实例（不需要 polling，只用于发送消息）
const botOptions = {
  polling: false,  // 不启用 polling，只用于发送消息
  request: {}
};

// 配置代理（如果不禁用）
if (disableProxy) {
  botOptions.request.proxy = false;
} else {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTP_PROXY || process.env.https_proxy;
  const proxyUrl = httpsProxy || httpProxy;

  if (proxyUrl) {
    botOptions.request.proxy = proxyUrl;
    console.log(`ℹ️  使用代理连接 Telegram: ${proxyUrl}\n`);
  } else {
    console.log('ℹ️  未检测到代理配置，使用直连\n');
  }
}

const bot = new TelegramBot(TOKEN, botOptions);

console.log('📤 正在发送消息...');
console.log(`   目标聊天 ID: ${chatId}`);
console.log(`   消息内容: ${message}\n`);

// 发送消息
bot.sendMessage(chatId, message)
  .then((sentMessage) => {
    console.log('✅ 消息发送成功！');
    console.log(`   消息 ID: ${sentMessage.message_id}`);
    console.log(`   发送时间: ${new Date(sentMessage.date * 1000).toLocaleString('zh-CN')}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 发送消息失败:', error.message);
    if (error.response) {
      console.error('   错误详情:', JSON.stringify(error.response.body, null, 2));
    }
    process.exit(1);
  });

