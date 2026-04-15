const HERO_SMS_API_KEY = 'B6907f80c38c15256ef08B031370ec22';
const HERO_SMS_BASE_URL = 'https://hero-sms.com/stubs/handler_api.php';
const HERO_SMS_SERVICE_CODE = 'dr';
const HERO_SMS_COUNTRY_CODE = '52';
const DEFAULT_POLL_INTERVAL_MS = 10000;
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
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }
  return payload?.message || payload?.error || fallbackMessage;
}

function normalizePhoneNumber(phoneNumber) {
  const raw = String(phoneNumber || '').trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('+') ? raw : `+${raw}`;
}

async function parseJsonResponse(response, fallbackMessage) {
  let payload;
  let rawText = '';

  if (typeof response?.text === 'function') {
    rawText = String(await response.text() || '').trim();
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = /^(ACCESS_)/i.test(rawText)
          ? { success: true, message: rawText, rawText }
          : { success: false, error: rawText, rawText };
      }
    } else {
      payload = null;
    }
  } else if (typeof response?.json === 'function') {
    payload = await response.json();
  } else {
    payload = null;
  }

  const failedByStatus = response?.ok === false;
  const failedByPayload = payload?.success === false || payload?.status === 'error';
  if (failedByStatus || failedByPayload) {
    const normalizedMessage = normalizeErrorMessage(payload, fallbackMessage);
    throw new Error(
      normalizedMessage === fallbackMessage
        ? normalizedMessage
        : `${fallbackMessage}：${normalizedMessage}`
    );
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

function normalizeDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return 0;
  }

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function extractActiveRows(payload = {}) {
  const rows = [];

  if (Array.isArray(payload?.data)) {
    rows.push(...payload.data);
  }
  if (Array.isArray(payload?.activations)) {
    rows.push(...payload.activations);
  }
  if (Array.isArray(payload?.activeActivations?.rows)) {
    rows.push(...payload.activeActivations.rows);
  }
  if (Array.isArray(payload)) {
    rows.push(...payload);
  }

  return rows;
}

function extractActivationRecord(record = {}) {
  return {
    activationId: String(record.activationId || record.id || record.activation_id || '').trim(),
    phoneNumber: normalizePhoneNumber(record.phoneNumber || record.phone || record.number || ''),
    serviceCode: String(record.serviceCode || record.service || record.service_code || '').trim().toLowerCase(),
    countryCode: String(record.countryCode || record.country || record.country_code || '').trim(),
    activationStatus: String(record.activationStatus || record.status || '').trim(),
    smsCode: String(record.smsCode || record.code || '').trim(),
    smsText: String(record.smsText || record.text || '').trim(),
    receiveSmsDate: String(record.receiveSmsDate || '').trim(),
    activationTime: String(record.activationTime || record.createDate || record.createdAt || record.estDate || '').trim(),
    createdAt: String(record.createdAt || record.createDate || record.activationTime || record.estDate || '').trim(),
    expiredAt: String(record.expiredAt || record.expireDate || record.expiredDate || '').trim(),
  };
}

function isMatchingActivation(record) {
  return Boolean(
    record.activationId
    && record.phoneNumber
    && record.serviceCode === HERO_SMS_SERVICE_CODE
    && record.countryCode === HERO_SMS_COUNTRY_CODE
  );
}

function pickNewestRecord(records = [], dateField = 'activationTime') {
  return [...records].sort(
    (left, right) => normalizeDateValue(right?.[dateField]) - normalizeDateValue(left?.[dateField])
  )[0] || null;
}

function isReusableActivationRecord(record) {
  if (!record) {
    return false;
  }

  if (!record.createdAt || !record.expiredAt) {
    return true;
  }

  return normalizeDateValue(record.createdAt) !== normalizeDateValue(record.expiredAt);
}

function pickReusableActivation(payload) {
  const matchingRecords = extractActiveRows(payload)
    .map((row) => extractActivationRecord(row))
    .filter(isMatchingActivation);

  if (!matchingRecords.length) {
    return null;
  }

  const latestRecord = pickNewestRecord(matchingRecords, 'activationTime');
  if (!isReusableActivationRecord(latestRecord)) {
    throw new Error(
      `最新活跃号不可复用：activationId=${latestRecord.activationId}，createdAt=expiredAt（${latestRecord.createdAt || '未知'}）`
    );
  }

  return {
    activationId: latestRecord.activationId,
    phoneNumber: latestRecord.phoneNumber,
    activationStatus: latestRecord.activationStatus,
    source: 'active',
  };
}

function pickLatestSmsEntry(records = []) {
  return pickNewestRecord(
    records.filter((record) => record.smsCode),
    'receiveSmsDate'
  );
}

function pickReadySmsEntry(records = []) {
  const readyRecords = records.filter((record) => record.activationStatus === '2' && record.smsCode);
  return pickNewestRecord(readyRecords, 'receiveSmsDate');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setActivationWaitingRetry(activationId, { fetchImpl = fetch } = {}) {
  const payload = await heroSmsRequest('setStatus', {
    id: activationId,
    status: 3,
  }, {
    fetchImpl,
    fallbackMessage: '设置 Hero-SMS 激活等待重发状态失败',
  });

  const text = typeof payload === 'string'
    ? payload
    : [payload?.message, payload?.status, payload?.data].filter(Boolean).join(' ');

  if (!/ACCESS_RETRY_GET/i.test(text)) {
    throw new Error('设置 Hero-SMS 激活等待重发状态失败：未收到 ACCESS_RETRY_GET');
  }
}

async function fetchSameActivationRecords(activationId, { fetchImpl = fetch } = {}) {
  const payload = await heroSmsRequest('getActiveActivations', {}, {
    fetchImpl,
    fallbackMessage: '获取 Hero-SMS 活跃激活列表失败',
  });

  return extractActiveRows(payload)
    .map((row) => extractActivationRecord(row))
    .filter((record) => record.activationId === activationId);
}

async function ensureActivationStatusChangedToRetry(activationId, { fetchImpl = fetch, intervalMs = 0, maxChecks = 3 } = {}) {
  for (let attempt = 0; attempt < maxChecks; attempt += 1) {
    const sameActivationRecords = await fetchSameActivationRecords(activationId, { fetchImpl });

    if (sameActivationRecords.some((record) => record.activationStatus === '3')) {
      return sameActivationRecords;
    }

    const readySms = pickReadySmsEntry(sameActivationRecords);
    if (readySms) {
      return sameActivationRecords;
    }

    if (attempt < maxChecks - 1 && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }

  throw new Error(`设置 Hero-SMS 激活等待重发状态失败：第 ${maxChecks} 次检查后状态仍未成功切换到 3，activationId=${activationId}`);
}

export async function requestHeroPhoneNumber({ fetchImpl = fetch } = {}) {
  const activePayload = await heroSmsRequest('getActiveActivations', {}, {
    fetchImpl,
    fallbackMessage: '获取 Hero-SMS 活跃激活列表失败',
  });

  let decisionReason = '';
  let reusableRecord = null;
  try {
    reusableRecord = pickReusableActivation(activePayload);
  } catch (error) {
    decisionReason = error?.message || String(error);
  }

  if (reusableRecord) {
    return {
      activationId: reusableRecord.activationId,
      phoneNumber: reusableRecord.phoneNumber,
      reused: true,
      activationStatus: reusableRecord.activationStatus,
      source: reusableRecord.source,
      decisionReason: '',
    };
  }

  const numberPayload = await heroSmsRequest('getNumberV2', {
    service: HERO_SMS_SERVICE_CODE,
    country: HERO_SMS_COUNTRY_CODE,
  }, {
    fetchImpl,
    fallbackMessage: '获取 Hero-SMS 手机号失败',
  });

  const activationId = String(numberPayload.activationId || numberPayload.id || numberPayload.activation_id || '').trim();
  const phoneNumber = normalizePhoneNumber(numberPayload.phoneNumber || numberPayload.phone || numberPayload.number || '');

  if (!activationId || !phoneNumber) {
    throw new Error('获取 Hero-SMS 手机号失败：响应缺少 activationId 或 phoneNumber');
  }

  return {
    activationId,
    phoneNumber,
    reused: false,
    activationStatus: '',
    source: 'new',
    decisionReason,
  };
}

export async function pollHeroSmsCode(activationId, {
  fetchImpl = fetch,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  mode = 'status',
} = {}) {
  const normalizedActivationId = String(activationId || '').trim();
  if (!normalizedActivationId) {
    throw new Error('轮询 Hero-SMS 验证码失败：activationId 不能为空');
  }

  const startedAt = Date.now();

  if (mode === 'active_list_new_sms') {
    await setActivationWaitingRetry(normalizedActivationId, { fetchImpl });
    let sameActivationRecords = await ensureActivationStatusChangedToRetry(normalizedActivationId, {
      fetchImpl,
      intervalMs,
      maxChecks: 3,
    });

    while (Date.now() - startedAt <= timeoutMs) {
      const readySms = pickReadySmsEntry(sameActivationRecords);
      if (readySms) {
        return {
          code: readySms.smsCode,
          dateTime: readySms.receiveSmsDate,
        };
      }

      if (intervalMs > 0) {
        await sleep(intervalMs);
      }

      sameActivationRecords = await fetchSameActivationRecords(normalizedActivationId, { fetchImpl });
    }

    throw new Error('短信验证码轮询超时，仍未收到新的有效验证码');
  }

  while (Date.now() - startedAt <= timeoutMs) {
    const payload = await heroSmsRequest('getStatusV2', {
      id: normalizedActivationId,
    }, {
      fetchImpl,
      fallbackMessage: '获取 Hero-SMS 短信验证码失败',
    });

    const sms = payload?.sms;
    const code = String(sms?.code || payload?.code || '').trim();
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
