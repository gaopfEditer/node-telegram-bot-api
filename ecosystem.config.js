module.exports = {
    apps: [{
        name: 'telegram-ws-bot',
        script: 'ws-to-telegram.js',
        cwd: __dirname,
        env: {
            NODE_ENV: 'production',
            NO_PROXY: '1'  // 服务端直连，不需要代理
        },
        // 使用 .env 中的变量，确保 dotenv 已加载
        autorestart: true,
        max_restarts: 10,
        watch: false,
        max_memory_restart: '500M'
    }]
};