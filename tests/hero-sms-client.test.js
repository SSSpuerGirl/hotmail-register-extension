import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { requestHeroPhoneNumber, pollHeroSmsCode } from '../shared/hero-sms-client.js';

function createJsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

async function loadHeroSmsBridge({ sendMessageImpl = async () => ({ ok: true, data: null }) } = {}) {
  const source = await readFile(new URL('../content/get-code.js', import.meta.url), 'utf8');
  const calls = [];
  const context = {
    globalThis: {},
    chrome: {
      runtime: {
        sendMessage: async (message) => {
          calls.push(message);
          return sendMessageImpl(message);
        },
      },
    },
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);

  return {
    source,
    calls,
    api: context.HotmailRegisterHeroSms,
  };
}

test('requestHeroPhoneNumber reuses matching active activation', async () => {
  const calls = [];

  const result = await requestHeroPhoneNumber({
    fetchImpl: async (url) => {
      calls.push(url);
      return createJsonResponse({
        success: true,
        activations: [
          {
            activationId: 'act-old',
            phoneNumber: '521111111111',
            serviceCode: 'dr',
            countryCode: '52',
          },
          {
            activationId: 'act-other',
            phoneNumber: '+861234567890',
            serviceCode: 'ot',
            countryCode: '86',
          },
        ],
      });
    },
  });

  assert.equal(result.activationId, 'act-old');
  assert.equal(result.phoneNumber, '+521111111111');
  assert.equal(result.reused, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /action=getActiveActivations/);
});

test('requestHeroPhoneNumber requests a new number when no active activation matches', async () => {
  const calls = [];

  const result = await requestHeroPhoneNumber({
    fetchImpl: async (url) => {
      calls.push(url);

      if (url.includes('action=getActiveActivations')) {
        return createJsonResponse({
          success: true,
          activations: [
            {
              activationId: 'act-other',
              phoneNumber: '+861234567890',
              serviceCode: 'ot',
              countryCode: '86',
            },
          ],
        });
      }

      return createJsonResponse({
        success: true,
        activationId: 'act-new',
        phoneNumber: '+522222222222',
      });
    },
  });

  assert.equal(result.activationId, 'act-new');
  assert.equal(result.phoneNumber, '+522222222222');
  assert.equal(result.reused, false);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /action=getActiveActivations/);
  assert.match(calls[1], /action=getNumberV2/);
  assert.match(calls[1], /service=dr/);
  assert.match(calls[1], /country=52/);
});

test('requestHeroPhoneNumber throws readable error when number request fails', async () => {
  await assert.rejects(
    () => requestHeroPhoneNumber({
      fetchImpl: async (url) => {
        if (url.includes('action=getActiveActivations')) {
          return createJsonResponse({ success: true, activations: [] });
        }

        return createJsonResponse({
          success: false,
          message: 'invalid api key',
        }, false, 403);
      },
    }),
    /invalid api key/
  );
});

test('pollHeroSmsCode keeps polling until sms code arrives', async () => {
  let callCount = 0;

  const result = await pollHeroSmsCode('act-123', {
    fetchImpl: async (url) => {
      callCount += 1;
      assert.match(url, /action=getStatusV2/);
      assert.match(url, /id=act-123/);

      if (callCount === 1) {
        return createJsonResponse({ success: true, status: 'WAITING', sms: null });
      }

      return createJsonResponse({
        success: true,
        status: 'RECEIVED',
        sms: {
          dateTime: '2026-04-14T13:00:00Z',
          code: '123456',
        },
      });
    },
    intervalMs: 0,
    timeoutMs: 1000,
  });

  assert.equal(callCount, 2);
  assert.equal(result.code, '123456');
  assert.equal(result.dateTime, '2026-04-14T13:00:00Z');
});

test('pollHeroSmsCode throws timeout error when no code is received', async () => {
  await assert.rejects(
    () => pollHeroSmsCode('act-123', {
      fetchImpl: async () => createJsonResponse({ success: true, status: 'WAITING', sms: null }),
      intervalMs: 0,
      timeoutMs: 10,
    }),
    /短信验证码轮询超时/
  );
});

test('get-code content script sends Hero-SMS runtime messages', async () => {
  const { source, calls, api } = await loadHeroSmsBridge({
    sendMessageImpl: async (message) => {
      if (message.type === 'HERO_SMS_REQUEST_PHONE') {
        return {
          ok: true,
          data: {
            activationId: 'act-runtime',
            phoneNumber: '+521111111111',
            reused: true,
          },
        };
      }

      if (message.type === 'HERO_SMS_POLL_CODE') {
        return {
          ok: true,
          data: {
            code: '654321',
            dateTime: '2026-04-15T10:00:00Z',
          },
        };
      }

      return { ok: false, error: 'unknown message' };
    },
  });

  const phoneResult = await api.requestHeroPhoneNumber();
  const codeResult = await api.pollHeroSmsCode('act-runtime', { intervalMs: 0, timeoutMs: 5000 });

  assert.match(source, /globalThis\.HotmailRegisterHeroSms\s*=\s*\{/);
  assert.equal(typeof api?.requestHeroPhoneNumber, 'function');
  assert.equal(typeof api?.pollHeroSmsCode, 'function');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'HERO_SMS_REQUEST_PHONE');
  assert.equal(typeof calls[0].payload, 'object');
  assert.equal(calls[1].type, 'HERO_SMS_POLL_CODE');
  assert.equal(calls[1].payload.activationId, 'act-runtime');
  assert.equal(calls[1].payload.intervalMs, 0);
  assert.equal(calls[1].payload.timeoutMs, 5000);
  assert.equal(phoneResult.activationId, 'act-runtime');
  assert.equal(codeResult.code, '654321');
});
