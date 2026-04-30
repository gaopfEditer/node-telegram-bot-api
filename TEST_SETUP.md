# 测试环境配置说明

## 方式一：使用环境变量（推荐，无需额外配置）

### Windows (PowerShell)
```powershell
$env:TEST_TELEGRAM_TOKEN="your_bot_token_here"
$env:TEST_USER_ID="your_user_id_here"
$env:TEST_GROUP_ID="your_group_id_here"
$env:TEST_PROVIDER_TOKEN="your_provider_token_here"
npm run test
```

### Windows (CMD)
```cmd
set TEST_TELEGRAM_TOKEN=your_bot_token_here
set TEST_USER_ID=your_user_id_here
set TEST_GROUP_ID=your_group_id_here
set TEST_PROVIDER_TOKEN=your_provider_token_here
npm run test
```

### Linux/Mac
```bash
export TEST_TELEGRAM_TOKEN=your_bot_token_here
export TEST_USER_ID=your_user_id_here
export TEST_GROUP_ID=your_group_id_here
export TEST_PROVIDER_TOKEN=your_provider_token_here
npm run test
```

## 方式二：使用 .env 文件

### 1. 安装 dotenv（如果还没有安装）
```bash
npm install --save-dev dotenv
```

### 2. 创建 .env 文件
在项目根目录创建 `.env` 文件，参考 `env.example` 文件填写内容：

```env
TEST_TELEGRAM_TOKEN=your_bot_token_here
TEST_USER_ID=your_user_id_here
TEST_GROUP_ID=your_group_id_here
TEST_PROVIDER_TOKEN=your_provider_token_here
TEST_GAME_SHORT_NAME=medusalab_test
TEST_STICKER_SET_NAME=pusheen
```

### 3. 修改测试入口（可选）
如果你想在测试中自动加载 .env 文件，可以在 `test/telegram.js` 文件开头添加：

```javascript
require('dotenv').config();
```

## 必需的环境变量说明

### TEST_TELEGRAM_TOKEN（必需）
- **说明**：Telegram Bot Token
- **获取方式**：在 Telegram 中联系 @BotFather，创建机器人后获取
- **示例**：`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### TEST_USER_ID（必需）
- **说明**：用于接收测试消息的用户 ID
- **获取方式**：在 Telegram 中联系 @userinfobot 获取你的用户 ID
- **示例**：`123456789`

### TEST_GROUP_ID（必需）
- **说明**：用于群组相关测试的群组 ID
- **获取方式**：

  **方法一：使用提供的脚本（推荐）**
  1. 确保 `.env` 文件中已设置 `TEST_TELEGRAM_TOKEN`
  2. 将机器人添加到群组（见下方"如何添加机器人到群组"）
  3. 在群组中发送任意消息
  4. 运行脚本：`node get-chat-id.js`
  5. 脚本会自动显示群组 ID

  **方法二：通过代码获取**
  1. 将机器人添加到群组并设为管理员
  2. 在群组中发送消息
  3. 机器人会收到消息，查看消息对象中的 `msg.chat.id`
  4. 或使用 `bot.getUpdates()` API 查看

  **方法三：使用其他机器人**
  - 使用 @getidsbot 或 @userinfobot（但这些机器人可能无法直接获取群组ID）
  
- **注意**：
  - 群组 ID 通常是负数（如 `-1001234567890`）
  - 普通群组（group）和超级群组（supergroup）的 ID 格式不同
  - 超级群组 ID 通常以 `-100` 开头
- **示例**：`-1001234567890`

### TEST_PROVIDER_TOKEN（可选，但非 CI 环境下建议提供）
- **说明**：支付提供商 Token，用于测试发票功能
- **获取方式**：从支付提供商（如 Stripe）获取
- **注意**：如果不提供，某些支付相关测试会被跳过

### TEST_GAME_SHORT_NAME（可选）
- **说明**：游戏短名称，用于游戏相关测试
- **默认值**：`medusalab_test`

### TEST_STICKER_SET_NAME（可选）
- **说明**：贴纸集名称，用于贴纸相关测试
- **默认值**：`pusheen`

## 如何添加机器人到群组

⚠️ **重要**：添加机器人的方式和添加普通用户不同！

### 方法一：通过机器人用户名链接（推荐）
1. 获取机器人的用户名（格式：`@your_bot_name`）
2. 在群组中发送以下任一内容：
   - `@your_bot_name`
   - `https://t.me/your_bot_name`
3. 点击链接，选择"添加到群组"

### 方法二：通过群组设置添加
1. 打开群组 → 点击群组名称进入设置
2. 点击"添加成员"或"Add Members"
3. **在搜索框中输入机器人的用户名**（如 `@your_bot_name`）
   - ⚠️ 注意：这里要搜索机器人的用户名，不是普通用户
4. 选择机器人并添加

### 方法三：使用 @BotFather
1. 联系 @BotFather
2. 发送 `/mybots`，选择你的机器人
3. 选择"Bot Settings" → "Add to Group"
4. 选择要添加的群组

### 添加后设置管理员权限
1. 在群组设置中找到机器人
2. 点击机器人 → "设为管理员" 或 "Make Admin"
3. 根据需要授予权限（建议授予所有权限以便测试）

## 重要提示

⚠️ **机器人权限要求**：
- 机器人必须是测试群组的管理员
- 机器人需要具有相应的管理员权限（如发送消息、删除消息、设置权限等）

⚠️ **安全提示**：
- 不要将 `.env` 文件提交到 Git 仓库
- 确保 `.env` 文件已添加到 `.gitignore`

## 运行测试

```bash
# 运行所有测试（包括 ESLint 和 Mocha）
npm run test

# 只运行 Mocha 测试
npm run mocha

# 只运行 ESLint 检查
npm run eslint
```

