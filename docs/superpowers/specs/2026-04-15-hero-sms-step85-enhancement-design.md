# Hero-SMS step8.5 design

## 目标

本次调整只覆盖两件事：

- step8.5 优先复用最新活跃号码
- 短信验证后兼容 codex consent 页面，再进入 localhost 回调

不重做整体注册链路，也不引入新的短信平台。

## 设计结论

### 1. 活跃号码选择

`shared/hero-sms-client.js`

- 先查 `getActiveActivations`
- 同时兼容：
  - `data[]`
  - `activeActivations.rows[]`
- 只接受：
  - `service=dr`
  - `country=52`
- 多条匹配记录时，按时间字段选择最新一条

返回结果只保留当前需要的上下文：

```js
{
  activationId,
  phoneNumber,
  reused,
  activationStatus,
  source,
  decisionReason
}
```

### 2. 验证码获取策略

`pollHeroSmsCode()` 支持两种模式：

#### `status`

- 使用 `getStatusV2`
- 适用于：
  - 新号码
  - 复用号但当前不是旧码状态

#### `active_list_new_sms`

- 适用于复用号且 `activationStatus === '2'`
- 先调用 `setStatus(id, 3)`
- 然后轮询 `getActiveActivations`
- 只关注当前 `activationId`

判定规则：

- `status=3` 且 `smsCode=""`：继续等待
- `status=2` 且 `smsCode` 非空：视为收到新验证码

已废弃：

- `smsEntryCount`
- `baselineSmsEntryCount`
- 按 `rows` 数量变化判断新短信

### 3. 页面侧职责

`content/signup-page.js`

step8.5 只负责页面交互：

- 检查当前是否处于 add-phone 页面
- 获取号码
- 填入手机号并提交
- 根据上下文选择轮询模式
- 填写验证码
- 等待进入授权页

页面脚本不直接解析 Hero-SMS 活跃列表结构。

### 4. consent 页面衔接

`shared/auto-flow.js` + `background.js`

短信验证后，流程不再假设直接进入 localhost 回调。

现在明确支持：

- `https://auth.openai.com/sign-in-with-chatgpt/codex/consent`

流程要求：

- step8 检测到需要短信验证时进入 step8.5
- step8.5 完成后重新执行 step8
- 在 consent 页点击 `Continue`
- 再等待 localhost 回调

这用于避免：

- `缺少 localhost 回调地址，请先完成步骤 8。`

## 影响文件

- `shared/hero-sms-client.js`
- `content/get-code.js`
- `content/signup-page.js`
- `shared/auto-flow.js`
- `background.js`

## 验证范围

- `tests/hero-sms-client.test.js`
- `tests/signup-page-phone-input.test.js`
- `tests/step85-consent-regression.test.js`
- `tests/auto-flow.test.js`
- `tests/continue-auto-flow.test.js`

## 备注

本文件只保留当前有效设计，不保留历史方案和废弃字段说明。
