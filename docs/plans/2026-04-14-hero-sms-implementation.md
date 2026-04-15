# Hero-SMS Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `content/signup-page.js` 的 step8 提供一个可复用的 Hero-SMS 接码模块，支持优先复用活跃激活记录，不存在时再申请新号码。

**Architecture:** 新增 `content/get-code.js` 作为独立 API 封装层，暴露 `requestHeroPhoneNumber()` 和 `pollHeroSmsCode()` 两个函数。测试放在 `tests/hero-sms-client.test.js`，通过注入 `fetchImpl` 覆盖活跃列表、申请号码、轮询验证码和错误分支。

**Tech Stack:** Node.js test runner, ES modules, browser fetch-compatible API

---

### Task 1: Add failing tests for Hero-SMS number selection

**Files:**
- Create: `tests/hero-sms-client.test.js`
- Create: `content/get-code.js`
- Test: `tests/hero-sms-client.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { requestHeroPhoneNumber, pollHeroSmsCode } from '../content/get-code.js';
```

Add tests that prove:
- `requestHeroPhoneNumber()` reuses an activation whose `serviceCode` is `dr` and `countryCode` is `52`
- `requestHeroPhoneNumber()` falls back to `getNumberV2` when no activation matches
- `pollHeroSmsCode()` keeps polling until `sms.code` appears
- timeout and API failure branches throw readable Chinese errors

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hero-sms-client.test.js`
Expected: FAIL because `content/get-code.js` does not exist yet or exported functions are missing

- [ ] **Step 3: Write minimal implementation**

Create `content/get-code.js` with:
- a hard-coded API key constant
- URL builder for Hero-SMS endpoints
- one request helper that normalizes fetch/network/api errors
- `requestHeroPhoneNumber()` that checks active activations first
- `pollHeroSmsCode()` that loops until `sms.code` exists or timeout is reached

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hero-sms-client.test.js`
Expected: PASS

### Task 2: Verify final behavior

**Files:**
- Create: `content/get-code.js`
- Test: `tests/hero-sms-client.test.js`

- [ ] **Step 1: Run the targeted test file again**

Run: `node --test tests/hero-sms-client.test.js`
Expected: PASS with all Hero-SMS cases green

- [ ] **Step 2: Confirm exported return shapes**

Verify the module exports:

```js
requestHeroPhoneNumber(); // => { activationId, phoneNumber, reused }
pollHeroSmsCode('activation-id'); // => { code, dateTime }
```

- [ ] **Step 3: Leave signup-page integration for a separate change**

Do not edit `content/signup-page.js` in this task.
