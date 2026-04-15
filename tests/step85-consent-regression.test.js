import test from 'node:test';
import assert from 'node:assert/strict';

import { runSingleAutoFlow, continueSingleAutoFlow } from '../shared/auto-flow.js';

test('runSingleAutoFlow reruns step 8 after step 8.5 before final verify', async () => {
  const calls = [];

  await runSingleAutoFlow({
    actions: {
      async prepareNextAccount() {
        calls.push('prepareNextAccount');
        return { address: 'user@hotmail.com' };
      },
      async refreshOauthFromVps() {
        calls.push('refreshOauthFromVps');
      },
      async findCurrentEmailRecord() {
        calls.push('findCurrentEmailRecord');
        return { id: 1, address: 'user@hotmail.com' };
      },
      async openOauthUrl() {
        calls.push('openOauthUrl');
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        if (step === 8 && !calls.includes('executeSignupStep:85')) {
          return { needsPhoneVerification: true };
        }
        return { ok: true };
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async pollVerificationCode(phase) {
        calls.push(`pollVerificationCode:${phase}`);
        return { code: phase === 'signup' ? '123456' : '654321' };
      },
      async fillLastCode(phase) {
        calls.push(`fillLastCode:${phase}`);
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
      async addLog(message) {
        calls.push(`log:${message}`);
      },
    },
  });

  assert.ok(calls.indexOf('executeSignupStep:85') < calls.indexOf('executeSignupStep:8', calls.indexOf('executeSignupStep:85')));
  assert.ok(calls.indexOf('executeSignupStep:8', calls.indexOf('executeSignupStep:85')) < calls.indexOf('executeFinalVerifyStep'));
});

test('continueSingleAutoFlow reruns step 8 after resuming from step 8.5', async () => {
  const calls = [];

  await continueSingleAutoFlow({
    state: {
      stepStatuses: {
        1: 'completed',
        2: 'completed',
        3: 'completed',
        4: 'completed',
        5: 'completed',
        6: 'completed',
        7: 'completed',
        8: 'completed',
        85: 'failed',
        9: 'pending',
      },
    },
    actions: {
      async addLog(message) {
        calls.push(`log:${message}`);
      },
      async executeSignupStep(step) {
        calls.push(`executeSignupStep:${step}`);
        return { ok: true };
      },
      async executeFinalVerifyStep() {
        calls.push('executeFinalVerifyStep');
      },
      async completeCurrentAccount() {
        calls.push('completeCurrentAccount');
        return { status: 'completed' };
      },
    },
  });

  assert.deepEqual(calls, [
    'log:继续自动流程：从步骤 8.5 开始',
    'executeSignupStep:85',
    'executeSignupStep:8',
    'executeFinalVerifyStep',
    'completeCurrentAccount',
    'log:自动流程继续完成，当前邮箱已标记为已使用',
  ]);
});
