# Hero-SMS step8.5 enhancement

## 目标

增强 step8.5 的 Hero-SMS 逻辑：

- 优先复用最新活跃号码
- 旧激活重发后按 `status` / `smsCode` 判断新验证码
- 短信验证完成后兼容 codex consent 页面，再进入 localhost 回调

## 当前实现

### 1. Hero-SMS 号码选择

`shared/hero-sms-client.js`

- 先调用 `getActiveActivations`
- 同时兼容：
  - `data[]`
  - `activeActivations.rows[]`
- 只接受：
  - `service=dr`
  - `country=52`
- 多条匹配记录时，按时间选择最新一条
- 返回字段已收敛为：
  - `activationId`
  - `phoneNumber`
  - `reused`
  - `activationStatus`
  - `source`
  - `decisionReason`

### 2. Hero-SMS 验证码轮询

`shared/hero-sms-client.js`

支持两种模式：

- `status`
  - 用 `getStatusV2` 轮询
  - 适用于新号或未进入旧码状态的复用号
- `active_list_new_sms`
  - 先 `setStatus(id, 3)`
  - 再轮询 `getActiveActivations`
  - 只看当前 `activationId` 对应记录
  - 判定规则：
    - `status=3` 且 `smsCode=""`：继续等待
    - `status=2` 且 `smsCode` 非空：视为收到新验证码

不再使用：

- `smsEntryCount`
- `baselineSmsEntryCount`
- `rows` 数量增量判断

### 3. step8.5 页面行为

`content/signup-page.js`

- 进入手机号验证页后先申请/复用号码
- 如果复用号且 `activationStatus === '2'`，则使用 `active_list_new_sms`
- 其他情况使用 `status`
- 收到验证码后填写页面输入框
- 填码完成后等待进入授权页

### 4. step8 / consent 页面衔接

`shared/auto-flow.js` + `background.js`

已兼容：

- `https://auth.openai.com/sign-in-with-chatgpt/codex/consent`

关键修正：

- step8 检测到需要短信验证时，会执行 step8.5
- step8.5 完成后会重新执行 step8
- 重新进入 consent 页后点击 `Continue`
- 然后再等待 localhost 回调

这样可避免：

- `缺少 localhost 回调地址，请先完成步骤 8。`

## 涉及文件

- `shared/hero-sms-client.js`
- `content/get-code.js`
- `content/signup-page.js`
- `shared/auto-flow.js`
- `background.js`
- `tests/hero-sms-client.test.js`
- `tests/signup-page-phone-input.test.js`
- `tests/step85-consent-regression.test.js`
- `tests/auto-flow.test.js`
- `tests/continue-auto-flow.test.js`

## 已验证

通过的相关测试：

- `tests/hero-sms-client.test.js`
- `tests/signup-page-phone-input.test.js`
- `tests/step85-consent-regression.test.js`
- `tests/auto-flow.test.js`
- `tests/continue-auto-flow.test.js`

## 备注

这份文档只保留当前有效方案，不再保留历史草稿和已废弃实现细节。
