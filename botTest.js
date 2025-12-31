// 加载环境变量（如果存在）
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不存在也没关系
}

// 代理配置
// 默认使用本地代理 127.0.0.1:7890（VPN 代理端口）
// 可以通过环境变量 PROXY_URL 自定义，或设置 NO_PROXY=1 禁用代理
const USE_PROXY = process.env.NO_PROXY !== '1';
const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';

// 修复错误的代理配置
const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];
proxyVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // 如果值只是数字（错误的端口配置），清除它
    if (/^[\d]+$/.test(value)) {
      console.log(`⚠️  检测到错误的代理配置 ${varName}=${value}（只有端口号），已清除`);
      delete process.env[varName];
    }
  }
});

const TelegramBot = require('node-telegram-bot-api');

// replace the value below with the Telegram token you receive from @BotFather
const token = '8586481737:AAGxMgzPMeGSlKlKWlb2klVOM6frq4-u2OA';

// Create a bot that uses 'polling' to fetch new updates
const botOptions = {
  polling: true,
  request: {}
};

// 配置代理
if (USE_PROXY) {
  botOptions.request.proxy = PROXY_URL;
  console.log(`🔗 使用代理: ${PROXY_URL}`);
} else {
  botOptions.request.proxy = false;
  console.log('🔗 已禁用代理，使用直连');
}

// 先创建机器人实例（不自动启动 polling）
const bot = new TelegramBot(token, {
  polling: false,  // 先不启动 polling
  request: botOptions.request
});

// 启动前先删除可能存在的 webhook
async function startBot() {
  try {
    console.log('🔄 正在检查并清理 webhook...');
    await bot.deleteWebHook();
    console.log('✅ Webhook 已清理');
  } catch (error) {
    // 如果没有 webhook 或删除失败，继续执行
    console.log('ℹ️  Webhook 检查完成');
  }
  
  // 等待一下，确保之前的连接完全关闭
  console.log('⏳ 等待 2 秒，确保之前的连接已关闭...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 现在启动 polling
  console.log('🔄 正在启动 polling...');
  try {
    await bot.startPolling();
    console.log('✅ Polling 已启动');
    console.log('📡 正在监听消息，请发送消息测试...');
    
    // 测试机器人是否正常工作
    bot.getMe().then((me) => {
      console.log(`✅ 机器人信息: @${me.username} (${me.first_name})`);
      console.log(`\n⚠️  重要提示：群组消息收不到的原因通常是机器人隐私模式！`);
      console.log(`\n📋 解决方案：`);
      console.log(`   1. 在 Telegram 中打开 @BotFather`);
      console.log(`   2. 发送命令: /setprivacy`);
      console.log(`   3. 选择你的机器人: @${me.username}`);
      console.log(`   4. 选择 "Disable"（禁用隐私模式）`);
      console.log(`   5. 或者运行: node check-bot-privacy.js 查看详细步骤\n`);
      console.log(`💡 其他检查项：`);
      console.log(`   - 确保机器人已添加到群组中（不是频道）`);
      console.log(`   - 确保机器人在群组中未被禁言`);
      console.log(`   - 检查控制台的 [原始更新] 日志，看是否收到了群组消息的更新\n`);
    }).catch((err) => {
      console.error('❌ 无法获取机器人信息:', err.message);
    });
    
    // 测试获取更新
    console.log('\n🔍 测试获取最近的更新...');
    bot.getUpdates({ limit: 10, timeout: 0 }).then((updates) => {
      console.log(`✅ 获取到 ${updates.length} 个更新`);
      updates.forEach((update, index) => {
        if (update.message) {
          const msg = update.message;
          const chat = msg.chat;
          console.log(`   更新 ${index + 1}: 聊天类型=${chat.type}, ID=${chat.id}, 内容=${msg.text || '[非文本]'}`);
        }
      });
    }).catch((err) => {
      console.error('❌ 获取更新失败:', err.message);
    });
  } catch (error) {
    console.error('❌ 启动 polling 失败:', error.message);
    if (error.message && error.message.includes('409')) {
      console.error('💡 提示：可能有其他实例正在运行，请先停止其他实例');
      console.error('   等待 5 秒后自动重试...');
      setTimeout(() => {
        startBot();
      }, 5000);
      return;
    }
  }
}

// 监听所有原始更新（用于调试）
// 通过 monkey patch processUpdate 来监听所有更新
const originalProcessUpdate = bot.processUpdate.bind(bot);
bot.processUpdate = function(update) {
  // 检查是否是群组消息
  if (update.message) {
    const msg = update.message;
    const chat = msg.chat;
    if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
      console.log('\n' + '⚠️'.repeat(30));
      console.log('⚠️  检测到群组消息更新！');
      console.log('⚠️'.repeat(30));
      console.log(`   群组 ID: ${chat.id}`);
      console.log(`   群组名称: ${chat.title || 'N/A'}`);
      console.log(`   消息内容: ${msg.text || '[非文本]'}`);
      console.log(`   消息 ID: ${msg.message_id}`);
      console.log(`   发送者: ${msg.from ? (msg.from.first_name || 'N/A') : 'N/A'}`);
      console.log(`   完整更新:`, JSON.stringify(update, null, 2));
      console.log('⚠️'.repeat(30) + '\n');
    } else {
      // 只显示非群组消息的简要信息
      console.log(`🔍 [更新] 聊天类型: ${chat ? chat.type : 'N/A'}, ID: ${chat ? chat.id : 'N/A'}`);
    }
  } else {
    // 非消息更新
    console.log(`🔍 [更新] 类型: ${Object.keys(update).filter(k => k !== 'update_id').join(', ')}`);
  }
  
  // 调用原始方法
  return originalProcessUpdate(update);
};

// 启动机器人
startBot();

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"

  // send back the matched "whatever" to the chat
  bot.sendMessage(chatId, resp);
});

// 监听所有事件（用于调试）
bot.on('*', (event, ...args) => {
  if (event !== 'polling_error' && event !== 'error') {
    console.log(`🔍 [事件] ${event}`);
    if (args.length > 0 && args[0] && typeof args[0] === 'object') {
      const firstArg = args[0];
      if (firstArg.chat) {
        console.log(`   聊天类型: ${firstArg.chat.type}, ID: ${firstArg.chat.id}`);
      }
    }
  }
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const from = msg.from;
  const chat = msg.chat;
  
  console.log('\n' + '='.repeat(60));
  console.log('📨 收到消息！');
  console.log('─'.repeat(60));
  console.log(`来自: ${from ? (from.first_name + (from.last_name ? ' ' + from.last_name : '')) : 'N/A'}`);
  if (from && from.username) {
    console.log(`用户名: @${from.username}`);
  }
  console.log(`用户 ID: ${from ? from.id : 'N/A'}`);
  console.log(`聊天类型: ${chat.type}`);
  if (chat.type === 'group' || chat.type === 'supergroup') {
    console.log(`群组: ${chat.title || 'N/A'} (ID: ${chat.id})`);
    console.log(`⚠️  注意：如果群组设置了隐私模式，机器人只能收到提及它的消息`);
  }
  console.log(`消息内容: ${msg.text || '[非文本消息]'}`);
  console.log(`是否提及机器人: ${msg.entities ? msg.entities.some(e => e.type === 'mention') : false}`);
  console.log(`时间: ${new Date(msg.date * 1000).toLocaleString('zh-CN')}`);
  console.log('='.repeat(60) + '\n');

  // send a message to the chat acknowledging receipt of their message
  // 收到信息之后，发送消息
  bot.sendMessage(chatId, '✅ 已收到你的消息！').catch((err) => {
    console.error('❌ 发送回复失败:', err.message);
    if (err.message.includes('bot was blocked') || err.message.includes('chat not found')) {
      console.error('💡 提示：机器人可能被禁言或没有权限发送消息');
    }
  });
});

// 监听群组相关事件
bot.on('new_chat_members', (msg) => {
  console.log('👥 新成员加入群组:', msg);
});

bot.on('left_chat_member', (msg) => {
  console.log('👋 成员离开群组:', msg);
});

bot.on('my_chat_member', (update) => {
  console.log('🤖 机器人在群组中的状态变化:', JSON.stringify(update, null, 2));
  const chat = update.chat;
  const newStatus = update.new_chat_member.status;
  console.log(`   群组: ${chat.title || 'N/A'} (ID: ${chat.id})`);
  console.log(`   新状态: ${newStatus}`);
  if (newStatus === 'restricted') {
    console.log('   ⚠️  机器人被限制，可能无法接收所有消息');
  } else if (newStatus === 'kicked') {
    console.log('   ❌ 机器人被踢出群组');
  } else if (newStatus === 'member' || newStatus === 'administrator') {
    console.log('   ✅ 机器人正常状态');
  }
});

// 错误处理
let errorCount = 0;
bot.on('polling_error', (error) => {
  errorCount++;
  const errorMsg = error.message || String(error);
  
  if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
    console.error(`❌ Polling 错误 (${errorCount}): 409 Conflict - 可能有其他实例正在运行`);
    if (errorCount === 1) {
      console.error('💡 解决方案：');
      console.error('   1. 停止所有正在运行的 botTest.js 实例');
      console.error('   2. 等待 10 秒后重新运行');
      console.error('   3. 或者检查是否有其他地方在使用同一个 token');
      console.error('   4. 检查是否有 webhook 设置（可以通过 Telegram Bot API 检查）');
    }
    // 如果连续出现多次 409 错误，建议停止
    if (errorCount >= 5) {
      console.error('\n⚠️  连续出现多次 409 错误，建议停止当前实例并检查问题');
    }
  } else {
    console.error(`❌ Polling 错误 (${errorCount}):`, errorMsg);
  }
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

console.log('🤖 机器人正在初始化...');
