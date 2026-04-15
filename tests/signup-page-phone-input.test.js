import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadSignupPageApi({
  querySelectorResult = null,
  querySelectorAllResults = [],
  initialElements = null,
  initialPageText = '',
  initialUrl = 'https://auth.openai.com/add-phone',
  configure,
} = {}) {
  const source = await readFile(new URL('../content/signup-page.js', import.meta.url), 'utf8');

  const logs = [];
  const heroSmsCalls = [];
  let currentElements = initialElements;
  let currentPageText = initialPageText;

  const phoneInput = {
    visible: true,
    type: 'tel',
    name: '__reservedForPhoneNumberInput_tel',
    id: 'tel',
    selectors: [
      'input#tel',
      'input[name="__reservedForPhoneNumberInput_tel"]',
      'input[autocomplete="tel"]',
      'input[type="tel"]:not([maxlength="6"])',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    getAttribute() {
      return null;
    },
  };
  const codeInput = {
    visible: true,
    type: 'text',
    name: 'code',
    id: 'code',
    selectors: [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ],
    getAttribute() {
      return null;
    },
  };
  const submitButton = {
    visible: true,
    disabled: false,
    textContent: 'Send',
    selectors: ['button', '[role="button"]', 'input[type="submit"]', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };

  function normalizeSelectorList(selector) {
    return String(selector || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function matchesSelector(element, selector) {
    return Array.isArray(element?.selectors) && element.selectors.includes(selector);
  }

  const document = {
    body: {
      get innerText() {
        return currentPageText;
      },
      get textContent() {
        return currentPageText;
      },
    },
    querySelector(selector) {
      if (currentElements) {
        const selectors = normalizeSelectorList(selector);
        return currentElements.find((element) => selectors.some((part) => matchesSelector(element, part))) || null;
      }
      return querySelectorResult;
    },
    querySelectorAll(selector) {
      if (currentElements) {
        const selectors = normalizeSelectorList(selector);
        return currentElements.filter((element) => selectors.some((part) => matchesSelector(element, part)));
      }
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
    location: { href: initialUrl },
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
    setInputValue(element, value) {
      element.value = value;
    },
    clickElement(element) {
      element.click?.();
    },
    waitForElement: async () => codeInput,
    log(message) {
      logs.push(message);
    },
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
    shouldUseStep8ContinueButton(state) {
      return Boolean(state?.isConsentUrl || state?.isConsentText);
    },
    isOAuthConsentUrl(url) {
      return /consent/.test(String(url || ''));
    },
    isStep8ActionText(text) {
      return /send|continue/i.test(String(text || ''));
    },
    queryFirst(selectors) {
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];
      for (const selector of selectorList) {
        const normalized = normalizeSelectorList(selector);
        const match = (currentElements || []).find((element) => normalized.some((part) => matchesSelector(element, part)));
        if (match) {
          return match;
        }
      }
      return null;
    },
  };
  context.HotmailRegisterHeroSms = {
    async requestHeroPhoneNumber() {
      heroSmsCalls.push({ type: 'request' });
      return {
        activationId: 'act-1',
        phoneNumber: '+521111111111',
        reused: true,
        activationStatus: '2',
      };
    },
    async pollHeroSmsCode(activationId, options) {
      heroSmsCalls.push({ type: 'poll', activationId, options });
      return { code: '123456', dateTime: '2026-04-15 10:00:00' };
    },
  };

  if (typeof configure === 'function') {
    await configure({
      context,
      logs,
      heroSmsCalls,
      setElements(elements) {
        currentElements = elements;
      },
      setPageText(text) {
        currentPageText = text;
      },
    });
  }

  vm.runInNewContext(`${source}
;globalThis.__signupPageTest = { getPhoneInput, step85PhoneVerification };`, context);

  return {
    api: context.__signupPageTest,
    logs,
    heroSmsCalls,
    phoneInput,
    codeInput,
    submitButton,
    context,
    setElements(elements) {
      currentElements = elements;
    },
    setPageText(text) {
      currentPageText = text;
    },
  };
}

test('getPhoneInput prefers a visible tel input over a hidden phone field', async () => {
  const hiddenPhoneField = {
    visible: false,
    type: 'hidden',
    name: 'phoneNumber',
    id: '_r_1d_-phoneNumber',
    getAttribute() {
      return null;
    },
  };
  const visibleTelInput = {
    visible: true,
    type: 'tel',
    name: '__reservedForPhoneNumberInput_tel',
    id: 'tel',
    getAttribute() {
      return null;
    },
  };

  const { api } = await loadSignupPageApi({
    querySelectorResult: hiddenPhoneField,
    querySelectorAllResults: [hiddenPhoneField, visibleTelInput],
  });

  assert.equal(api.getPhoneInput(), visibleTelInput);
});

test('step85PhoneVerification logs which SMS polling strategy is used', async () => {
  const phoneInput = {
    visible: true,
    type: 'tel',
    value: '',
    selectors: [
      'input#tel',
      'input[name="__reservedForPhoneNumberInput_tel"]',
      'input[autocomplete="tel"]',
      'input[type="tel"]:not([maxlength="6"])',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    getAttribute() {
      return null;
    },
  };
  const codeInput = {
    visible: true,
    type: 'text',
    value: '',
    selectors: [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ],
    getAttribute() {
      return null;
    },
  };
  const submitButton = {
    visible: true,
    disabled: false,
    textContent: 'Send',
    selectors: ['button', '[role="button"]', 'input[type="submit"]', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };
  const continueButton = {
    visible: true,
    disabled: false,
    textContent: 'Continue',
    selectors: ['button', '[role="button"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };

  const { api, logs, heroSmsCalls } = await loadSignupPageApi({
    initialElements: [phoneInput, submitButton, codeInput, continueButton],
    initialPageText: 'Authorize Continue',
    initialUrl: 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent',
  });

  const result = await api.step85PhoneVerification();

  assert.equal(result.code, '123456');
  assert.equal(heroSmsCalls[1].type, 'poll');
  assert.equal(heroSmsCalls[1].options.mode, 'active_list_new_sms');
  assert.ok(logs.some((message) => message.includes('已选择最新复用号')));
  assert.ok(logs.some((message) => message.includes('当前使用旧号重发轮询模式')));
  assert.ok(logs.some((message) => message.includes('收到短信验证码 123456')));
  assert.ok(logs.some((message) => message.includes('时间 2026-04-15 10:00:00')));
});

test('step85PhoneVerification logs why it requested a new number', async () => {
  const phoneInput = {
    visible: true,
    type: 'tel',
    value: '',
    selectors: [
      'input#tel',
      'input[name="__reservedForPhoneNumberInput_tel"]',
      'input[autocomplete="tel"]',
      'input[type="tel"]:not([maxlength="6"])',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    getAttribute() {
      return null;
    },
  };
  const codeInput = {
    visible: true,
    type: 'text',
    value: '',
    selectors: [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ],
    getAttribute() {
      return null;
    },
  };
  const submitButton = {
    visible: true,
    disabled: false,
    textContent: 'Send',
    selectors: ['button', '[role="button"]', 'input[type="submit"]', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };
  const continueButton = {
    visible: true,
    disabled: false,
    textContent: 'Continue',
    selectors: ['button', '[role="button"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };

  const { api, logs, context } = await loadSignupPageApi({
    initialElements: [phoneInput, submitButton],
    initialPageText: 'Add phone',
    configure: async ({ context, setElements, setPageText }) => {
      let clickCount = 0;
      context.HotmailRegisterHeroSms.requestHeroPhoneNumber = async () => ({
        activationId: 'act-new',
        phoneNumber: '+522222222222',
        reused: false,
        activationStatus: '',
        decisionReason: '最新活跃号不可复用：activationId=act-stale，createdAt=2026-04-15 03:36:20，expiredAt=2026-04-15 03:36:20',
      });
      context.HotmailRegisterUtils.waitForElement = async () => codeInput;
      submitButton.click = () => {
        clickCount += 1;
        if (clickCount === 2) {
          context.location.href = 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent';
          setElements([continueButton]);
          setPageText('Authorize Continue');
        }
      };
    },
  });

  const result = await api.step85PhoneVerification();

  assert.equal(result.ok, true);
  assert.ok(logs.some((message) => message.includes('createdAt=expiredAt')));
});

test('step85PhoneVerification accepts consent page after sms verify', async () => {
  const phoneInput = {
    visible: true,
    type: 'tel',
    value: '',
    selectors: [
      'input#tel',
      'input[name="__reservedForPhoneNumberInput_tel"]',
      'input[autocomplete="tel"]',
      'input[type="tel"]:not([maxlength="6"])',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    getAttribute() {
      return null;
    },
  };
  const codeInput = {
    visible: true,
    type: 'text',
    value: '',
    selectors: [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ],
    getAttribute() {
      return null;
    },
  };
  const submitButton = {
    visible: true,
    disabled: false,
    textContent: 'Send',
    selectors: ['button', '[role="button"]', 'input[type="submit"]', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };
  const continueButton = {
    visible: true,
    disabled: false,
    textContent: 'Continue',
    selectors: ['button', '[role="button"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };

  const { api, context } = await loadSignupPageApi({
    initialElements: [phoneInput, submitButton],
    initialPageText: 'Add phone',
    configure: async ({ context, setElements, setPageText }) => {
      let clickCount = 0;
      context.HotmailRegisterUtils.waitForElement = async () => codeInput;
      submitButton.click = () => {
        clickCount += 1;
        if (clickCount === 2) {
          context.location.href = 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent';
          setElements([continueButton]);
          setPageText('Authorize Continue');
        }
      };
    },
  });

  const result = await api.step85PhoneVerification();

  assert.equal(result.ok, true);
  assert.equal(context.location.href, 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent');
});

test('step85PhoneVerification reuses step5 profile flow when sms verify lands on profile page before consent', async () => {
  const phoneInput = {
    visible: true,
    type: 'tel',
    value: '',
    selectors: [
      'input#tel',
      'input[name="__reservedForPhoneNumberInput_tel"]',
      'input[autocomplete="tel"]',
      'input[type="tel"]:not([maxlength="6"])',
      'input[name*="phone" i]',
      'input[id*="phone" i]',
    ],
    getAttribute() {
      return null;
    },
  };
  const codeInput = {
    visible: true,
    type: 'text',
    value: '',
    selectors: [
      'input[autocomplete="one-time-code"]',
      'input[name*="code" i]',
      'input[id*="code" i]',
      'input[inputmode="numeric"]',
      'input[maxlength="6"]',
    ],
    getAttribute() {
      return null;
    },
  };
  const submitButton = {
    visible: true,
    disabled: false,
    textContent: 'Send',
    selectors: ['button', '[role="button"]', 'input[type="submit"]', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };
  const nameInput = {
    visible: true,
    value: '',
    selectors: ['input[name="name"]', 'input[autocomplete="name"]'],
    getAttribute() {
      return null;
    },
    dispatchEvent() {},
  };
  const ageInput = {
    visible: true,
    value: '',
    selectors: ['input[name="age"]', 'input[inputmode="numeric"]', 'input[type="number"]'],
    getAttribute() {
      return null;
    },
    dispatchEvent() {},
  };
  const profileSubmitButton = {
    visible: true,
    disabled: false,
    textContent: 'Continue',
    selectors: ['button', 'button[type="submit"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };
  const consentButton = {
    visible: true,
    disabled: false,
    textContent: 'Continue',
    selectors: ['button', '[role="button"]'],
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return null;
    },
    click() {},
    scrollIntoView() {},
    focus() {},
  };

  const { api, logs, context } = await loadSignupPageApi({
    initialElements: [phoneInput, submitButton],
    initialPageText: 'Add phone',
    configure: async ({ context, setElements, setPageText }) => {
      let clickCount = 0;
      context.HotmailRegisterUtils.waitForElement = async () => codeInput;
      submitButton.click = () => {
        clickCount += 1;
        if (clickCount === 2) {
          context.location.href = 'https://auth.openai.com/u/signup/profile';
          setElements([nameInput, ageInput, profileSubmitButton]);
          setPageText('Full name Age Continue');
        }
      };
      profileSubmitButton.click = () => {
        context.location.href = 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent';
        setElements([consentButton]);
        setPageText('Authorize Continue');
      };
    },
  });

  const result = await api.step85PhoneVerification();

  assert.equal(result.ok, true);
  assert.equal(nameInput.value.length > 0, true);
  assert.equal(ageInput.value.length > 0, true);
  assert.equal(context.location.href, 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent');
  assert.ok(logs.some((message) => message.includes('步骤 5：资料已提交')));
});
