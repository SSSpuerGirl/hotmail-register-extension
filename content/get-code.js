async function requestHeroPhoneNumber() {
  const response = await chrome.runtime.sendMessage({
    type: 'HERO_SMS_REQUEST_PHONE',
    payload: {},
  });

  if (!response?.ok) {
    throw new Error(response?.error || '获取 Hero-SMS 手机号失败');
  }

  return response.data;
}

async function pollHeroSmsCode(activationId, {
  intervalMs,
  timeoutMs,
  mode,
} = {}) {
  const response = await chrome.runtime.sendMessage({
    type: 'HERO_SMS_POLL_CODE',
    payload: {
      activationId,
      intervalMs,
      timeoutMs,
      mode,
    },
  });

  if (!response?.ok) {
    throw new Error(response?.error || '获取 Hero-SMS 短信验证码失败');
  }

  return response.data;
}

globalThis.HotmailRegisterHeroSms = {
  requestHeroPhoneNumber,
  pollHeroSmsCode,
};
