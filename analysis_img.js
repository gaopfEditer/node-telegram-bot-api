#!/usr/bin/env node
/**
 * 连接已打开的浏览器，访问百度热榜并抓取最新热榜列表
 * 使用 @playwright/test 的 chromium.connectOverCDP
 *
 * 使用前请先以调试模式启动 Chrome/Edge：
 *   Windows: "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *   Mac: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 *
 * 然后执行: node analysis_img.js
 * 或: npx playwright test --config=/dev/null (仅安装浏览器) 后 node analysis_img.js
 */
const { chromium } = require('@playwright/test');
const http = require('http');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';
const BAIDU_TOP_URL = 'https://top.baidu.com/board?tab=realtime';
const LIST_SIZE = Number(process.env.LIST_SIZE) || 30;

/** 从 Chrome 调试端口获取 WebSocket 地址 */
function getWsUrl(baseUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl);
    const opts = { hostname: u.hostname, port: u.port || 9222, path: '/json/version', method: 'GET' };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          const ws = data.webSocketDebuggerUrl;
          if (ws) resolve(ws);
          else reject(new Error('webSocketDebuggerUrl 不存在'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('连接超时')); });
    req.end();
  });
}

async function main() {
  console.log('[analysis_img] 连接浏览器:', CDP_URL);
  let wsUrl = CDP_URL;
  if (!CDP_URL.startsWith('ws://') && !CDP_URL.startsWith('wss://')) {
    try {
      wsUrl = await getWsUrl(CDP_URL);
      console.log('[analysis_img] WebSocket:', wsUrl);
    } catch (e) {
      console.error('[analysis_img] 获取 CDP 失败:', e.message);
      console.error('  请确认 Chrome 已用 --remote-debugging-port=9222 启动');
      process.exit(1);
    }
  }
  let browser;
  try {
    browser = await chromium.connectOverCDP(wsUrl, { timeout: 10000 });
  } catch (e) {
    console.error('[analysis_img] 连接失败:', e.message);
    console.error('  请确认 Chrome 已用 --remote-debugging-port=9222 启动');
    process.exit(1);
  }

  const contexts = browser.contexts();
  const context = contexts.length ? contexts[0] : await browser.newContext();
  let page = context.pages().find(p => !p.url().startsWith('chrome-'));

  if (!page) {
    page = await context.newPage();
  }

  console.log('[analysis_img] 访问百度热榜:', BAIDU_TOP_URL);
  await page.goto(BAIDU_TOP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  // 等待热榜列表渲染
  await new Promise(r => setTimeout(r, 2000));

  // 页面截图
  const screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });
  console.log('[analysis_img] 截图完成, 大小:', screenshotBuffer.length, 'bytes');

  // 调用 Gemini 接口：FormData 上传截图并获取分析结果（超时 50s）
  const GEMINI_CHAT_URL = process.env.GEMINI_CHAT_URL || 'https://bz.d.ezcoin.ink/chat';
  const GEMINI_CHAT_TIMEOUT = Number(process.env.GEMINI_CHAT_TIMEOUT) || 50000; // 50s
  const form = new FormData();
  form.append('role', 'analysis_img');
  form.append('message', '这张图片的主旨？');
  form.append('files', new Blob([screenshotBuffer], { type: 'image/png' }), 'screenshot.png');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_CHAT_TIMEOUT);
  try {
    const chatRes = await fetch(GEMINI_CHAT_URL, { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(timeoutId);
    const chatData = await chatRes.json();
    if (!chatRes.ok) {
      console.error('[analysis_img] Gemini 接口错误:', chatRes.status, chatData);
    } else {
      console.log('[analysis_img] Gemini 分析结果:\n', chatData.text || chatData);
    }
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.error('[analysis_img] Gemini 请求超时（' + GEMINI_CHAT_TIMEOUT / 1000 + 's）');
    } else {
      throw e;
    }
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
