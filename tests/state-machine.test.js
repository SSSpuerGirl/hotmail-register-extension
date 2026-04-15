import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeSettings } from '../shared/state-machine.js';

test('sanitizeSettings preserves persisted settings beyond basic text fields', () => {
  const result = sanitizeSettings({
    apiKey: ' key ',
    mailApiBaseUrl: ' http://localhost:5000 ',
    defaultLoginPassword: ' openai-pass ',
    enableSmsVerification: true,
    usedAccounts: {
      'user@hotmail.com': { status: 'completed' },
    },
    runCount: 3,
    skipFailedAccounts: true,
    mailKeyword: 'OpenAI',
    mailFromKeyword: 'noreply@openai.com',
    recordSuccessResults: true,
    successResults: [{ address: 'user@hotmail.com' }],
  });

  assert.equal(result.apiKey, 'key');
  assert.equal(result.mailApiBaseUrl, 'http://localhost:5000');
  assert.equal(result.defaultLoginPassword, 'openai-pass');
  assert.equal(result.enableSmsVerification, true);
  assert.deepEqual(result.usedAccounts, {
    'user@hotmail.com': { status: 'completed' },
  });
  assert.equal(result.runCount, 3);
  assert.equal(result.skipFailedAccounts, true);
  assert.equal(result.mailKeyword, 'OpenAI');
  assert.equal(result.mailFromKeyword, 'noreply@openai.com');
  assert.equal(result.recordSuccessResults, true);
  assert.deepEqual(result.successResults, [{ address: 'user@hotmail.com' }]);
});
