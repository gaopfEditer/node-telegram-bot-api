module.exports = {
  apps: [
    {
      name: 'telegram-ws-bot',
      script: 'ws-to-telegram.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        NO_PROXY: '1',  // 服务端直连，不需要代理
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: '500M',
    },
    {
      name: 'gemini-client',
      script: 'gemini_client.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        NO_PROXY: '1',  // 服务端直连，不需要代理
      },
      autorestart: true,
      max_restarts: 10,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};