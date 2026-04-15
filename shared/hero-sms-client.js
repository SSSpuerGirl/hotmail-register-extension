const HERO_SMS_API_KEY = 'B6907f80c38c15256ef08B031370ec22';
const HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php';
const HERO_SMS_SERVICE_CODE = 'dr';
const HERO_SMS_COUNTRY_CODE = '52';
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;

function buildHeroSmsUrl(action, params = {}) {
  const url = new URL(HERO_SMS_BASE_URL);
  url.searchParams.set('api_key', HERO_SMS_API_KEY);
  url.searchParams.set('action', action);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function normalizeErrorMessage(payload, fallbackMessage) {
  return payload?.message || payload?.error || fallbackMessage;
}

function normalizePhoneNumber(phoneNumber) {
  const raw = String(phoneNumber || '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('+')) {
    return raw;
  }
  return `+${raw}`;
}

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(normalizeErrorMessage(payload, fallbackMessage));
  }
  return payload;
}

async function heroSmsRequest(action, params, { fetchImpl = fetch, fallbackMessage } = {}) {
  if (!String(HERO_SMS_API_KEY || '').trim()) {
    throw new Error('Hero-SMS API Key 未配置，请先在 content/get-code.js 中填写。');
  }

  const url = buildHeroSmsUrl(action, params);

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error(`${fallbackMessage}：${error?.message || String(error)}`);
  }

  return parseJsonResponse(response, fallbackMessage);
}

function extractActivationRecord(record = {}) {
  return {
    activationId: record.activationId || record.id || record.activation_id || '',
    phoneNumber: normalizePhoneNumber(record.phoneNumber || record.phone || record.number || ''),
    serviceCode: String(record.serviceCode || record.service || record.service_code || '').trim().toLowerCase(),
    countryCode: String(record.countryCode || record.country || record.country_code || '').trim(),
  };
}

function findReusableActivation(payload) {
  const items = Array.isArray(payload?.activations)
    ? payload.activations
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  for (const item of items) {
    const record = extractActivationRecord(item);
    if (!record.activationId || !record.phoneNumber) continue;
    if (record.serviceCode !== HERO_SMS_SERVICE_CODE) continue;
    if (record.countryCode !== HERO_SMS_COUNTRY_CODE) continue;
    return record;
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestHeroPhoneNumber({ fetchImpl = fetch } = {}) {
  const activePayload = await heroSmsRequest('getActiveActivations', {}, {
    fetchImpl,
    fallbackMessage: '获取 Hero-SMS 活跃激活列表失败',
  });

  const reusableRecord = findReusableActivation(activePayload);
  if (reusableRecord) {
    return {
      activationId: reusableRecord.activationId,
      phoneNumber: reusableRecord.phoneNumber,
      reused: true,
    };
  }

  const numberPayload = await heroSmsRequest('getNumberV2', {
    service: HERO_SMS_SERVICE_CODE,
    country: HERO_SMS_COUNTRY_CODE,
  }, {
    fetchImpl,
    fallbackMessage: '获取 Hero-SMS 手机号失败',
  });

  const activationId = numberPayload.activationId || numberPayload.id || numberPayload.activation_id || '';
  const phoneNumber = normalizePhoneNumber(numberPayload.phoneNumber || numberPayload.phone || numberPayload.number || '');

  if (!activationId || !phoneNumber) {
    throw new Error('获取 Hero-SMS 手机号失败：响应缺少 activationId 或 phoneNumber');
  }

  return {
    activationId,
    phoneNumber,
    reused: false,
  };
}

export async function pollHeroSmsCode(activationId, {
  fetchImpl = fetch,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
} = {}) {
  const normalizedActivationId = String(activationId || '').trim();
  if (!normalizedActivationId) {
    throw new Error('轮询 Hero-SMS 验证码失败：activationId 不能为空');
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const payload = await heroSmsRequest('getStatusV2', {
      id: normalizedActivationId,
    }, {
      fetchImpl,
      fallbackMessage: '获取 Hero-SMS 短信验证码失败',
    });

    const sms = payload?.sms;
    const code = String(sms?.code || '').trim();
    const dateTime = sms?.dateTime || sms?.datetime || sms?.date || '';

    if (code) {
      return {
        code,
        dateTime,
      };
    }

    if (intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  throw new Error('短信验证码轮询超时，仍未收到有效验证码');
}
