# Hero-SMS Step8 Design

**状态**: 已确认方案，待实现  
**日期**: 2026-04-14  
**范围**: 为 `content/signup-page.js` 的 step8 手机验证准备可复用的 Hero-SMS 接码模块

## 1. 目标

在 `content/` 目录新增一个可复用的 `get-code.js`，用于接入 Hero-SMS 自动接码能力，供 `content/signup-page.js` 在 step8 手机验证阶段调用。

该模块只负责两件事：

- 获取一个可用手机号
- 轮询该手机号收到的最新短信验证码

这样 step8 只需要调用模块方法，不需要关心 Hero-SMS 接口细节。

## 2. 非目标

以下内容不在本次范围内：

- 现在就改写 `content/signup-page.js` 的 step8 主流程
- 增加 sidepanel 配置项来管理 Hero-SMS API Key
- 增加 background 转发层
- 支持多个短信平台切换

## 3. 推荐方案

采用“`content/get-code.js` 独立封装 + `signup-page.js` 直接调用”的最小方案。

原因：

- step8 的调用点已经明确，先做一个纯函数模块最直接
- 现有项目里已经有 `shared/luckmail-client.js` 这种独立 API 封装思路，可以保持风格一致
- 先把 Hero-SMS 调用细节收口到一个文件，后面改成从配置读取 API Key 也更容易
- 先查活跃激活列表再决定是否申请新号，可以避免重复买号

## 4. 模块设计

文件：

```txt
content/get-code.js
```

导出两个函数：

### 4.1 `requestHeroPhoneNumber()`

职责：

1. 调用 Hero-SMS 的活跃激活列表接口
2. 用固定条件筛选可复用记录：
   - `serviceCode = dr`
   - `countryCode = 52`
3. 如果已存在匹配记录，直接复用对应的 `activationId` 和 `phoneNumber`
4. 如果不存在，再调用 `getNumberV2` 新申请号码

固定传参：

- `service=dr`
- `country=52`

返回结构：

```js
{
  activationId,
  phoneNumber,
  reused
}
```

其中 `reused` 用于标记这次是复用已有激活还是新申请。

### 4.2 `pollHeroSmsCode(activationId, options?)`

职责：

- 调用 Hero-SMS 的 `getStatusV2`
- 通过 `activationId` 轮询短信状态
- 从响应中提取：
  - `sms.dateTime`
  - `sms.code`
- 返回最新一条可用验证码

返回结构：

```js
{
  code,
  dateTime
}
```

默认行为：

- 支持超时和轮询间隔配置
- 如果一直拿不到短信，超时后抛错
- 如果响应里没有有效验证码，继续轮询

## 5. 配置约定

本次先把 Hero-SMS API Key 写死在 `content/get-code.js` 内部常量中。

这样可以先把 step8 接码能力接通，后面再改成读取扩展配置。

## 6. 错误处理

模块需要统一抛出可读的中文错误，至少覆盖：

- API Key 缺失
- 获取活跃激活列表接口请求失败
- 活跃激活列表返回结构不合法
- 获取手机号接口请求失败
- 获取手机号接口返回缺少 `activationId` 或 `phoneNumber`
- 获取验证码接口请求失败
- 获取验证码接口返回结构不合法
- 轮询超时仍未收到有效验证码

## 7. 测试范围

至少覆盖以下行为：

- `requestHeroPhoneNumber()` 能从活跃列表复用符合 `serviceCode/countryCode` 的号码
- 活跃列表没有匹配记录时，`requestHeroPhoneNumber()` 会调用新申请接口
- `requestHeroPhoneNumber()` 能正确提取 `activationId`、`phoneNumber` 和 `reused`
- 获取号码接口失败时抛出可读错误
- `pollHeroSmsCode()` 会忽略没有验证码的响应并继续轮询
- `pollHeroSmsCode()` 在拿到验证码时返回 `{ code, dateTime }`
- `pollHeroSmsCode()` 超时时抛错

## 8. 后续接入方式

等模块完成后，`content/signup-page.js` 的 step8 可以按下面方式接入：

```js
const { activationId, phoneNumber, reused } = await requestHeroPhoneNumber();
const { code, dateTime } = await pollHeroSmsCode(activationId);
```

step8 负责把 `phoneNumber` 填入页面，把 `code` 回填到短信验证码输入框。Hero-SMS 的查询活跃激活、申请号码、轮询短信和错误归一化都由 `content/get-code.js` 处理。
