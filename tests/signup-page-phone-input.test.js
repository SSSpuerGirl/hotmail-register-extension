import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadSignupPageApi({ querySelectorResult = null, querySelectorAllResults = [] } = {}) {
  const source = await readFile(new URL('../content/signup-page.js', import.meta.url), 'utf8');

  const document = {
    body: {
      innerText: '',
      textContent: '',
    },
    querySelector() {
      return querySelectorResult;
    },
    querySelectorAll() {
      return querySelectorAllResults;
    },
  };

  const context = {
    globalThis: {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
        sendMessage: async () => ({ ok: true }),
      },
    },
    document,
    location: { href: 'https://auth.openai.com/add-phone' },
    sessionStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    setTimeout,
    clearTimeout,
    URL,
  };

  context.globalThis = context;
  context.HotmailRegisterUtils = {
    isVisible: (element) => Boolean(element?.visible),
    getPendingSignupStep: async () => null,
    clearPendingSignupStep: async () => {},
    setPendingSignupStep: async () => {},
    sleep: async () => {},
    humanPause: async () => {},
    log() {},
    reportComplete() {},
    reportError() {},
  };
  context.HotmailRegisterHelpers = {
    getCodeInput() {
      return null;
    },
    getInteractionPacingProfile() {
      return {};
    },
    normalizeInlineText(text) {
      return String(text || '').replace(/\s+/g, ' ').trim();
    },
    isEmailVerificationUrl() {
      return false;
    },
    isProfileSetupPageText() {
      return false;
    },
    isSignupPasswordValidationErrorText() {
      return false;
    },
    isSignupLandingPageText() {
      return false;
    },
    isDefinitiveSignupUrl() {
      return false;
    },
    isLoginPasswordPageText() {
      return false;
    },
    getEmailInput() {
      return null;
    },
    isSignupFlowUrl() {
      return false;
    },
    shouldSwitchToLoginFlowAfterGrace() {
      return false;
    },
    queryFirst() {
      return null;
    },
  };
  context.HotmailRegisterHeroSms = {};

  vm.runInNewContext(`${source}\n;globalThis.__signupPageTest = { getPhoneInput };`, context);

  return context.__signupPageTest;
}

test('getPhoneInput prefers a visible tel input over a hidden phone field', async () => {
  const hiddenPhoneField = {
    visible: false,
    type: 'hidden',
    name: 'phoneNumber',
    id: '_r_1d_-phoneNumber',
  };
  const visibleTelInput = {
    visible: true,
    type: 'tel',
    name: '__reservedForPhoneNumberInput_tel',
    id: 'tel',
  };

  const api = await loadSignupPageApi({
    querySelectorResult: hiddenPhoneField,
    querySelectorAllResults: [hiddenPhoneField, visibleTelInput],
  });

  assert.equal(api.getPhoneInput(), visibleTelInput);
});
