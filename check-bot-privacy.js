/**
 * 检查机器人隐私设置并关闭隐私模式
 * 
 * 重要：机器人的隐私模式（Privacy Mode）会影响群组消息接收
 * - 开启隐私模式：只能收到 @机器人 的消息
 * - 关闭隐私模式：可以收到所有群组消息
 */

const TelegramBot = require('node-telegram-bot-api');

// 加载环境变量
try {
  require('dotenv').config();
} catch (e) {
  // dotenv 不存在也没关系
}

const token = '8586481737:AAGxMgzPMeGSlKlKWlb2klVOM6frq4-u2OA';

// 代理配置
const USE_PROXY = process.env.NO_PROXY !== '1';
const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';

const bot = new TelegramBot(token, {
  polling: false,
  request: {
    proxy: USE_PROXY ? PROXY_URL : false
  }
});

async function checkAndFixPrivacy() {
  try {
    console.log('🔍 正在检查机器人信息...\n');
    
    const me = await bot.getMe();
    console.log(`✅ 机器人信息:`);
    console.log(`   用户名: @${me.username}`);
    console.log(`   名称: ${me.first_name}`);
    console.log(`   ID: ${me.id}\n`);
    
    console.log('📋 关于群组消息接收：');
    console.log('   1. node-telegram-bot-api 库完全支持群组消息');
    console.log('   2. 不需要 SSL/webhook，Polling 模式就可以接收群组消息');
    console.log('   3. 但是机器人的隐私设置会影响群组消息接收\n');
    
    console.log('⚠️  重要：需要关闭机器人的隐私模式！\n');
    console.log('📝 关闭隐私模式的步骤：');
    console.log('   1. 在 Telegram 中打开 @BotFather');
    console.log('   2. 发送命令: /mybots');
    console.log('   3. 选择你的机器人');
    console.log('   4. 选择 "Bot Settings" 或 "机器人设置"');
    console.log('   5. 选择 "Group Privacy" 或 "群组隐私"');
    console.log('   6. 选择 "Turn off" 或 "关闭"');
    console.log('   7. 或者直接发送: /setprivacy');
    console.log('   8. 选择你的机器人');
    console.log('   9. 选择 "Disable"（禁用隐私模式）\n');
    
    console.log('💡 或者使用以下命令快速设置：');
    console.log('   1. 发送 /setprivacy 给 @BotFather');
    console.log('   2. 选择你的机器人');
    console.log('   3. 选择 Disable\n');
    
    console.log('✅ 关闭隐私模式后，机器人就可以接收所有群组消息了！\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

checkAndFixPrivacy();

