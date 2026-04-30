/**
 * 监听群组内指定人员的消息
 * 
 * 使用方法：
 * 1. 在 .env 文件中配置：
 *    - TEST_TELEGRAM_TOKEN: 机器人 Token
 *    - TARGET_GROUP_ID: 要监听的群组 ID（可选，不设置则监听所有群组）
 *    - TARGET_USER_IDS: 要监听的人员 ID，多个用逗号分隔（可选，不设置则监听所有人）
 * 
 * 2. 运行: node listen-group-messages.js
 */

// 加载环境变量
require('dotenv').config();

// 检查是否要禁用代理（通过环境变量 NO_PROXY 或命令行参数）
const disableProxy = process.env.NO_PROXY === '1' || process.argv.includes('--no-proxy') || process.argv.includes('-n');

// 检查并修复代理配置问题
if (!disableProxy) {
  // 修复代理格式：如果代理值缺少协议前缀，则添加 http://
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
  proxyVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      // 如果值只是数字（错误的端口配置），清除它
      if (/^[\d]+$/.test(value)) {
        console.log(`⚠️  检测到错误的代理配置 ${varName}=${value}（只有端口号），已清除`);
        delete process.env[varName];
      }
      // 如果值缺少协议前缀，添加 http://
      else if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('socks://')) {
        // 检查是否是 127.0.0.1:端口 格式
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
  // 禁用代理
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

// 配置目标群组和用户
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID ? parseInt(process.env.TARGET_GROUP_ID) : null;
const TARGET_USER_IDS = process.env.TARGET_USER_IDS 
  ? process.env.TARGET_USER_IDS.split(',').map(id => parseInt(id.trim()))
  : null;

// 创建机器人实例
const botOptions = { 
  polling: true,
  request: {}
};

// 配置代理（如果不禁用）
if (disableProxy) {
  // 禁用代理
  botOptions.request.proxy = false;
} else {
  // 获取代理配置
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const proxyUrl = httpsProxy || httpProxy;
  
  if (proxyUrl) {
    // 明确设置代理到 request 选项
    botOptions.request.proxy = proxyUrl;
    console.log(`ℹ️  使用代理连接 Telegram: ${proxyUrl}`);
    console.log('   如果代理连接失败，可以使用 --no-proxy 参数禁用代理\n');
  } else {
    console.log('ℹ️  未检测到代理配置，使用直连\n');
  }
}

const bot = new TelegramBot(TOKEN, botOptions);

console.log('🤖 机器人已启动，正在监听消息...\n');

if (TARGET_GROUP_ID) {
  console.log(`📌 目标群组 ID: ${TARGET_GROUP_ID}`);
} else {
  console.log('📌 监听所有群组');
}

if (TARGET_USER_IDS && TARGET_USER_IDS.length > 0) {
  console.log(`👤 目标用户 ID: ${TARGET_USER_IDS.join(', ')}`);
} else {
  console.log('👤 监听所有用户');
}

console.log('\n💡 按 Ctrl+C 停止机器人\n');
console.log('='.repeat(60) + '\n');

// 监听消息
bot.on('message', (msg) => {
  const chat = msg.chat;
  const from = msg.from;
  
  // 检查是否是群组消息
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    return; // 忽略非群组消息
  }
  
  // 检查是否是指定群组
  if (TARGET_GROUP_ID && chat.id !== TARGET_GROUP_ID) {
    return; // 忽略其他群组
  }
  
  // 检查是否是指定用户
  if (TARGET_USER_IDS && TARGET_USER_IDS.length > 0) {
    if (!from || !TARGET_USER_IDS.includes(from.id)) {
      return; // 忽略其他用户
    }
  }
  
  // 显示消息信息
  console.log('📨 收到消息');
  console.log('─'.repeat(60));
  console.log(`群组: ${chat.title || 'N/A'} (ID: ${chat.id})`);
  console.log(`用户: ${from ? (from.first_name + (from.last_name ? ' ' + from.last_name : '')) : 'N/A'} (ID: ${from ? from.id : 'N/A'})`);
  console.log(`用户名: ${from && from.username ? '@' + from.username : 'N/A'}`);
  
  if (msg.text) {
    console.log(`内容: ${msg.text}`);
  } else if (msg.photo) {
    console.log(`内容: [图片]`);
  } else if (msg.video) {
    console.log(`内容: [视频]`);
  } else if (msg.audio) {
    console.log(`内容: [音频]`);
  } else if (msg.document) {
    console.log(`内容: [文件] ${msg.document.file_name || 'N/A'}`);
  } else if (msg.sticker) {
    console.log(`内容: [贴纸]`);
  } else if (msg.voice) {
    console.log(`内容: [语音]`);
  } else {
    console.log(`内容: [其他类型消息]`);
  }
  
  console.log(`时间: ${new Date(msg.date * 1000).toLocaleString('zh-CN')}`);
  console.log('='.repeat(60) + '\n');
});

// 错误处理
bot.on('polling_error', (error) => {
  console.error('❌ Polling 错误:', error.message);
});

bot.on('error', (error) => {
  console.error('❌ 错误:', error.message);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 正在停止机器人...');
  bot.stopPolling().then(() => {
    console.log('✅ 机器人已停止');
    process.exit(0);
  }).catch((err) => {
    console.error('❌ 停止时出错:', err.message);
    process.exit(1);
  });
});

