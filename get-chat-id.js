/**
 * 获取 Telegram 群组/聊天 ID 的辅助脚本
 * 
 * 使用方法：
 * 1. 设置环境变量 TEST_TELEGRAM_TOKEN（或使用 .env 文件）
 * 2. 将机器人添加到群组（或私聊机器人）
 * 3. 在群组中发送任意消息（或私聊机器人发送消息）
 * 4. 运行此脚本：node get-chat-id.js
 * 
 * 方式一：使用环境变量（推荐）
 *   Windows PowerShell: $env:TEST_TELEGRAM_TOKEN="your_token"; node get-chat-id.js
 *   Windows CMD: set TEST_TELEGRAM_TOKEN=your_token && node get-chat-id.js
 *   Linux/Mac: export TEST_TELEGRAM_TOKEN=your_token && node get-chat-id.js
 * 
 * 方式二：使用 .env 文件
 *   1. 安装 dotenv: npm install --save-dev dotenv
 *   2. 创建 .env 文件并设置 TEST_TELEGRAM_TOKEN
 *   3. 运行: node get-chat-id.js
 * 
 * 代理问题：
 *   如果遇到代理连接错误，可以使用以下方式禁用代理：
 *   - 命令行参数: node get-chat-id.js --no-proxy
 *   - 环境变量: $env:NO_PROXY="1"; node get-chat-id.js
 */

// 尝试加载 dotenv（支持本地和全局安装）
let dotenvLoaded = false;
try {
  // 首先尝试从本地 node_modules 加载
  require('dotenv').config();
  dotenvLoaded = true;
} catch (e) {
  // 如果本地没有，尝试从全局路径加载
  try {
    const npmGlobalPath = require('child_process').execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const globalDotenvPath = require('path').join(npmGlobalPath, 'dotenv');
    require(globalDotenvPath).config();
    dotenvLoaded = true;
    console.log('ℹ️  使用全局安装的 dotenv\n');
  } catch (globalError) {
    // 全局也没有，使用环境变量
    console.log('ℹ️  提示：未找到本地 dotenv，将使用系统环境变量');
    console.log('   如需使用 .env 文件，请运行: npm install --save-dev dotenv\n');
  }
}

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
      // 如果端口是 7897，自动修复为 7890（常见代理端口）
      else if (value.includes(':7897')) {
        const fixedValue = value.replace(':7897', ':7890');
        console.log(`⚠️  检测到代理端口 7897，自动修复为 7890`);
        console.log(`   修复前: ${varName}=${value}`);
        console.log(`   修复后: ${varName}=${fixedValue}\n`);
        process.env[varName] = fixedValue;
      }
    }
  });
} else {
  // 禁用代理
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
  proxyVars.forEach(varName => {
    if (process.env[varName]) {
      delete process.env[varName];
    }
  });
  console.log('ℹ️  已禁用代理，使用直连\n');
}

const TelegramBot = require('./index.js');

const TOKEN = process.env.TEST_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TEST_TELEGRAM_TOKEN;

if (!TOKEN) {
  console.error('❌ 错误：未找到机器人 Token');
  console.log('\n请使用以下方式之一设置 Token：');
  console.log('\n方式一：使用环境变量（推荐）');
  console.log('  Windows PowerShell:');
  console.log('    $env:TEST_TELEGRAM_TOKEN="your_token_here"');
  console.log('    node get-chat-id.js');
  console.log('\n  Windows CMD:');
  console.log('    set TEST_TELEGRAM_TOKEN=your_token_here && node get-chat-id.js');
  console.log('\n  Linux/Mac:');
  console.log('    export TEST_TELEGRAM_TOKEN=your_token_here && node get-chat-id.js');
  console.log('\n方式二：使用 .env 文件');
  console.log('  1. 安装 dotenv: npm install --save-dev dotenv');
  console.log('  2. 创建 .env 文件并设置: TEST_TELEGRAM_TOKEN=your_token_here');
  console.log('  3. 运行: node get-chat-id.js');
  console.log('\n环境变量名称（按优先级）：');
  console.log('  - TEST_TELEGRAM_BOT_TOKEN');
  console.log('  - TELEGRAM_BOT_TOKEN');
  console.log('  - TEST_TELEGRAM_TOKEN');
  process.exit(1);
}

// 创建机器人实例，明确配置代理
const botOptions = { 
  polling: true,
  request: {}
};

// 配置代理（如果不禁用）
if (disableProxy) {
  // 禁用代理
  botOptions.request.proxy = false;
  console.log('ℹ️  已禁用代理，使用直连\n');
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

console.log('🤖 机器人已启动，等待消息...');
console.log('📝 请在群组中发送任意消息（或私聊机器人发送消息）');
console.log('💡 提示：确保机器人已添加到群组中\n');

let messageCount = 0;

bot.on('message', (msg) => {
  messageCount++;
  const chat = msg.chat;
  const chatType = chat.type; // 'private', 'group', 'supergroup', 'channel'
  
  console.log('\n' + '='.repeat(60));
  console.log(`📨 收到第 ${messageCount} 条消息`);
  console.log('='.repeat(60));
  console.log(`聊天类型: ${chatType}`);
  console.log(`聊天 ID: ${chat.id}`);
  console.log(`聊天标题: ${chat.title || chat.first_name || 'N/A'}`);
  
  if (chatType === 'group' || chatType === 'supergroup') {
    console.log(`\n✅ 群组 ID: ${chat.id}`);
    console.log(`📋 复制以下内容到 .env 文件：`);
    console.log(`   TEST_GROUP_ID=${chat.id}`);
  } else if (chatType === 'private') {
    console.log(`\n✅ 用户 ID: ${chat.id}`);
    console.log(`📋 复制以下内容到 .env 文件：`);
    console.log(`   TEST_USER_ID=${chat.id}`);
  }
  
  console.log('\n💡 提示：按 Ctrl+C 停止机器人\n');
});

bot.on('polling_error', (error) => {
  console.error('❌ Polling 错误:', error.message);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n👋 正在停止机器人...');
  bot.stopPolling().then(() => {
    console.log('✅ 机器人已停止');
    process.exit(0);
  });
});

