// Общая логика ИИ-помощника для Windows (главный процесс Electron) и Android (окно приложения).
// Claude, Gemini, модель на компьютере (LM Studio) и любые свои ИИ по API в трёх форматах:
// OpenAI-совместимый, Anthropic или Gemini. Сеть и хранение ключей передаются снаружи.

export const BUILTIN = ['anthropic', 'gemini', 'local'];
const FORMATS = ['openai', 'anthropic', 'gemini'];
const AUTH = ['bearer', 'api-key', 'x-api-key', 'none'];

export const DEFAULTS = {
  provider: 'anthropic', // anthropic | gemini | local | custom:<id>
  visionProvider: '', // для картинок, если основной ИИ их не понимает
  speechProvider: '', // для распознавания речи
  models: { anthropic: 'claude-haiku-4-5-20251001', gemini: 'gemini-3.5-flash-lite', local: '' },
  endpoint: 'http://localhost:1234/v1',
  custom: [], // { id, name, format, baseUrl, model, vision, auth, headers, speechModel }
  keys: {} // anthropic | gemini | c:<id> → зашифрованный ключ
};

export function normalizeConfig(c) {
  c = c && typeof c === 'object' ? c : {};
  return { ...DEFAULTS, ...c, models: { ...DEFAULTS.models, ...(c.models || {}) }, custom: Array.isArray(c.custom) ? c.custom : [], keys: { ...(c.keys || {}) } };
}

/** Ключ без мусора: пробелов, переносов, кавычек, «Bearer ». */
export function cleanKey(k) {
  const s = String(k || '')
    .replace(/[​-‍﻿ ]/g, '')
    .trim()
    .replace(/^["'«]+|["'»]+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');
  if (/[^\x21-\x7E]/.test(s)) throw new Error('В ключе есть русские буквы или лишние символы — скопируй ключ ещё раз прямо с сайта сервиса.');
  return s;
}

function parseHeaders(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (/^[A-Za-z0-9-]{1,60}$/.test(k) && v && v.length < 500) out[k] = v;
  }
  return out;
}

function authHeaders(p, key) {
  if (!key || p.auth === 'none') return {};
  if (p.auth === 'api-key') return { authorization: `Api-Key ${key}` };
  if (p.auth === 'x-api-key') return { 'x-api-key': key };
  return { authorization: `Bearer ${key}` };
}

const isOpenRouter = (p) => /openrouter\.ai/i.test(p.baseUrl || '');
const extraFor = (p) => (isOpenRouter(p) ? { 'HTTP-Referer': 'https://mnema.local', 'X-Title': 'Mnema' } : {});
const trimBase = (u) => String(u || '').trim().replace(/\/+$/, '');
/** Сохранённый ключ годится только для того же сервера: если адрес поменяли, ключ нужно ввести заново — иначе его увёл бы любой, кто подставит свой адрес. */
export function sameServer(a, b) {
  try {
    return new URL(trimBase(a)).origin === new URL(trimBase(b)).origin;
  } catch {
    return false;
  }
}
export const FREE_ROUTER = 'openrouter/free';
const isFreeModel = (m) => /:free$/.test(m || '') || m === FREE_ROUTER;
/** Бесплатные модели OpenRouter часто перегружены: просим OpenRouter при ошибке взять любую другую бесплатную. */
const openRouterFallback = (p) => (isOpenRouter(p) && isFreeModel(p.model) && p.model !== FREE_ROUTER ? { models: [p.model, FREE_ROUTER] } : {});

function publicConfig(c) {
  return {
    provider: c.provider,
    visionProvider: c.visionProvider || '',
    speechProvider: c.speechProvider || '',
    models: c.models,
    endpoint: c.endpoint,
    custom: c.custom.map((p) => ({ ...p, hasKey: Boolean(c.keys['c:' + p.id]) })),
    hasKey: { anthropic: Boolean(c.keys.anthropic), gemini: Boolean(c.keys.gemini) }
  };
}

/**
 * http(url, { method, headers, body, bodyBase64, timeout }) → Promise<{ status, text, error? }>
 * store: { read() → config, write(config), encrypt(s), decrypt(s), newId() }
 */
export function createAiService({ http, store }) {
  async function fetchJson(url, init, timeout = 150000) {
    const res = await http(url, { ...init, timeout });
    if (!res.status) {
      const code = String(res.error || res.text || '');
      if (/ECONNREFUSED|refused/i.test(code)) throw new Error('Не удаётся подключиться. Если это программа на компьютере (LM Studio, Ollama) — запусти в ней сервер.');
      if (/ENOTFOUND|EAI_AGAIN|UnknownHost/i.test(code)) throw new Error('Не найден сервер по этому адресу. Проверь адрес и интернет.');
      if (/timeout|Нет ответа|Timeout/i.test(code)) throw new Error('ИИ не ответил вовремя. Попробуй ещё раз.');
      throw new Error('Нет связи с сервером (' + (code || 'network') + '). Проверь интернет.');
    }
    let body = null;
    try {
      body = JSON.parse(res.text);
    } catch {
      /* не JSON */
    }
    if (res.status < 200 || res.status >= 300) {
      let msg = body?.error?.message || body?.error || body?.message || body?.detail || String(res.text || '').slice(0, 200);
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
      // OpenRouter прячет настоящую причину в metadata.raw («… is temporarily rate-limited upstream …»).
      const meta = body?.error?.metadata;
      const raw = meta && (typeof meta.raw === 'string' ? meta.raw : meta.raw ? JSON.stringify(meta.raw) : '');
      if (raw) msg += ` — ${meta.provider_name ? meta.provider_name + ': ' : ''}${raw.slice(0, 300)}`;
      const err = new Error(`${res.status}: ${msg}`);
      err.status = res.status;
      err.upstream = /rate-limited upstream|temporarily rate-limited/i.test(msg);
      throw err;
    }
    if (body === null) throw new Error('Сервер ответил не в формате JSON. Проверь адрес API.');
    return body;
  }

  async function callOpenAI(p, key, req, maxTokens) {
    const base = trimBase(p.baseUrl);
    const content = req.image ? [{ type: 'text', text: req.text }, { type: 'image_url', image_url: { url: `data:${req.image.mime};base64,${req.image.data}` } }] : req.text;
    const messages = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content });
    const body = await fetchJson(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(p, key), ...extraFor(p), ...parseHeaders(p.headers) },
      body: JSON.stringify({ model: p.model || undefined, ...openRouterFallback(p), messages, max_tokens: maxTokens, temperature: 0.3 })
    });
    const msg = body.choices && body.choices[0] && body.choices[0].message;
    let text = msg ? msg.content : '';
    if (Array.isArray(text)) text = text.map((x) => (typeof x === 'string' ? x : x.text || '')).join('');
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  async function callAnthropic(p, key, req, maxTokens) {
    const base = trimBase(p.baseUrl || 'https://api.anthropic.com');
    const content = [];
    if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.mime, data: req.image.data } });
    content.push({ type: 'text', text: req.text });
    const auth = p.auth && p.auth !== 'x-api-key' ? authHeaders(p, key) : key ? { 'x-api-key': key } : {};
    const body = await fetchJson(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...auth, ...parseHeaders(p.headers) },
      body: JSON.stringify({ model: p.model, max_tokens: maxTokens, system: req.system || undefined, messages: [{ role: 'user', content }] })
    });
    return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  }

  async function callGemini(p, key, req, maxTokens) {
    const base = trimBase(p.baseUrl || 'https://generativelanguage.googleapis.com');
    const parts = [];
    if (req.image) parts.push({ inline_data: { mime_type: req.image.mime, data: req.image.data } });
    if (req.audio) parts.push({ inline_data: { mime_type: req.audio.mime, data: req.audio.data } });
    parts.push({ text: req.text });
    const body = await fetchJson(`${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-goog-api-key': key } : {}), ...parseHeaders(p.headers) },
      body: JSON.stringify({
        systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: maxTokens }
      })
    });
    const cand = body.candidates && body.candidates[0];
    return ((cand && cand.content && cand.content.parts) || []).map((x) => x.text || '').join('').trim();
  }

  function resolve(c, id) {
    const dec = (k) => store.decrypt(c.keys[k]);
    if (id === 'anthropic') return { p: { name: 'Claude', format: 'anthropic', baseUrl: 'https://api.anthropic.com', model: c.models.anthropic, vision: true }, key: dec('anthropic'), needKey: true };
    if (id === 'gemini') return { p: { name: 'Gemini', format: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: c.models.gemini, vision: true }, key: dec('gemini'), needKey: true };
    if (id === 'local') {
      const base = trimBase(c.endpoint || DEFAULTS.endpoint);
      return { p: { name: 'На компьютере', format: 'openai', baseUrl: base, model: c.models.local, vision: true, auth: 'none' }, key: '', needKey: false };
    }
    if (typeof id === 'string' && id.startsWith('custom:')) {
      const p = c.custom.find((x) => x.id === id.slice(7));
      if (!p) throw new Error('Этот ИИ удалён. Выбери другой в настройках ИИ.');
      return { p, key: dec('c:' + p.id), needKey: p.auth !== 'none' && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(p.baseUrl || '') };
    }
    throw new Error('Не выбран ИИ.');
  }

  async function runOnce(p, key, req, maxTokens) {
    if (p.format === 'anthropic') return callAnthropic(p, key, req, maxTokens);
    if (p.format === 'gemini') return callGemini(p, key, req, maxTokens);
    return callOpenAI(p, key, req, maxTokens);
  }

  async function run(p, key, req) {
    const maxTokens = Math.min(Math.max(Number(req.maxTokens) || 600, 32), 6000);
    if (!p.model && (p.format !== 'openai' || isOpenRouter(p))) throw new Error(`Не выбрана модель для «${p.name}». Нажми «Найти модели».`);
    try {
      return await runOnce(p, key, req, maxTokens);
    } catch (e) {
      // Перегрузка или короткий сбой: одна повторная попытка через пару секунд.
      if (![429, 502, 503, 529].includes(e.status) || req.noRetry) throw e;
      await new Promise((r) => setTimeout(r, e.status === 429 ? 2500 : 1500));
      // Бесплатная модель OpenRouter занята у поставщика — пробуем любую свободную бесплатную.
      const alt = isOpenRouter(p) && isFreeModel(p.model) && p.model !== FREE_ROUTER && e.status === 429 ? { ...p, model: FREE_ROUTER } : p;
      return runOnce(alt, key, req, maxTokens);
    }
  }

  function sanitizeCustom(x, prev) {
    const s = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const baseUrl = s(x.baseUrl, 300);
    if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new Error('Адрес API должен начинаться с https:// (или http:// для компьютера и домашней сети).');
    return {
      id: prev ? prev.id : store.newId(),
      name: s(x.name, 60) || 'Мой ИИ',
      format: FORMATS.includes(x.format) ? x.format : 'openai',
      baseUrl,
      model: s(x.model, 200),
      vision: x.vision !== false,
      auth: AUTH.includes(x.auth) ? x.auth : 'bearer',
      headers: s(x.headers, 2000),
      speechModel: s(x.speechModel, 200)
    };
  }

  async function listModels(p, key) {
    const base = trimBase(p.baseUrl);
    if (p.format === 'gemini') {
      const body = await fetchJson(`${base}/v1beta/models?pageSize=200`, { method: 'GET', headers: { ...(key ? { 'x-goog-api-key': key } : {}), ...parseHeaders(p.headers) } }, 15000);
      return (body.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => ({ id: String(m.name).replace(/^models\//, ''), vision: true }));
    }
    if (p.format === 'anthropic') {
      const auth = p.auth && p.auth !== 'x-api-key' ? authHeaders(p, key) : key ? { 'x-api-key': key } : {};
      const body = await fetchJson(`${base}/v1/models?limit=100`, { method: 'GET', headers: { 'anthropic-version': '2023-06-01', ...auth, ...parseHeaders(p.headers) } }, 15000);
      return (body.data || []).map((m) => ({ id: m.id, vision: true }));
    }
    const get = (withAuth) => fetchJson(`${base}/models`, { method: 'GET', headers: { ...(withAuth ? authHeaders(p, key) : {}), ...extraFor(p), ...parseHeaders(p.headers) } }, 20000);
    let body;
    try {
      body = await get(true);
    } catch (e) {
      // Некоторые сервисы (например, OpenRouter) отдают список моделей и без ключа.
      if (e.status === 401 || e.status === 403) body = await get(false);
      else throw e;
    }
    const list = Array.isArray(body) ? body : body.data || body.models || [];
    if (isOpenRouter(p) && !list.some((m) => (m && (m.id || m)) === FREE_ROUTER)) list.push({ id: FREE_ROUTER, architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0', completion: '0' } });
    return list
      .map((m) => {
        if (typeof m === 'string') return { id: m };
        const id = m.id || m.name;
        const mods = (m.architecture && (m.architecture.input_modalities || [])) || [];
        const vision = mods.length ? mods.includes('image') : m.architecture && typeof m.architecture.modality === 'string' ? /image/.test(m.architecture.modality.split('->')[0]) : undefined;
        const free = /:free$/.test(id) || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0) || undefined;
        return { id, vision, free };
      })
      .filter((m) => m.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }

  async function openRouterKeyInfo(p, key) {
    const body = await fetchJson(`${trimBase(p.baseUrl)}/key`, { method: 'GET', headers: { ...authHeaders(p, key), ...extraFor(p) } }, 15000);
    const d = body.data || body;
    const left = d.limit_remaining ?? (d.limit != null ? d.limit - (d.usage || 0) : null);
    const free = d.free_model_daily_requests;
    const freeLeft = free && free.remaining != null ? `, бесплатных запросов на сегодня осталось: ${free.remaining} из ${free.limit}` : '';
    return `Ключ OpenRouter принят${d.is_free_tier ? ' (бесплатный уровень — подходят модели с «:free»)' : ''}${left != null ? `, осталось кредитов: ${Number(left).toFixed(2)}` : ''}${freeLeft}.`;
  }

  const validId = (c, id) => BUILTIN.includes(id) || (typeof id === 'string' && id.startsWith('custom:') && c.custom.some((x) => 'custom:' + x.id === id));

  // ---------- Речь → текст ----------

  function multipart(fields, file) {
    const boundary = '----mnema' + Math.random().toString(36).slice(2);
    const enc = new TextEncoder();
    const chunks = [];
    for (const [k, v] of Object.entries(fields)) chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`));
    chunks.push(file.bytes);
    chunks.push(enc.encode(`\r\n--${boundary}--\r\n`));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    return { boundary, bytes: all };
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Модель для речи у OpenAI-совместимых сервисов (можно поменять в «Для продвинутых»). */
  function speechModelFor(p) {
    if (p.speechModel) return p.speechModel;
    if (/groq\.com/i.test(p.baseUrl)) return 'whisper-large-v3';
    if (/localhost|127\.0\.0\.1/.test(p.baseUrl)) return 'whisper-1';
    return 'whisper-1';
  }

  async function transcribe(c, req) {
    const id = c.speechProvider || c.provider;
    const r = resolve(c, id);
    if (r.needKey && !r.key) throw new Error(`Не указан ключ API для «${r.p.name}».`);
    const lang = req.lang || 'ru';
    if (r.p.format === 'gemini') {
      return run(r.p, r.key, { text: `Запиши дословно, что сказано на аудио (язык: ${lang}). Верни только текст, без пояснений.`, audio: { mime: req.mime, data: req.data }, maxTokens: 400 });
    }
    if (r.p.format === 'anthropic') throw new Error(`«${r.p.name}» не умеет распознавать речь. В настройках ИИ выбери для речи другой ИИ (например, OpenAI, Groq или Gemini).`);
    const ext = /webm/.test(req.mime) ? 'webm' : /ogg/.test(req.mime) ? 'ogg' : /mp4|m4a|aac/.test(req.mime) ? 'm4a' : 'wav';
    const form = multipart({ model: speechModelFor(r.p), language: lang.slice(0, 2), response_format: 'json' }, { name: 'answer.' + ext, mime: req.mime, bytes: b64ToBytes(req.data) });
    const body = await fetchJson(`${trimBase(r.p.baseUrl)}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${form.boundary}`, ...authHeaders(r.p, r.key), ...extraFor(r.p), ...parseHeaders(r.p.headers) },
      body: bytesToB64(form.bytes),
      bodyBase64: true
    }, 120000);
    return String(body.text || '').trim();
  }

  // ---------- Обработчики (одинаковые на Windows и Android) ----------

  return {
    getConfig: () => publicConfig(normalizeConfig(store.read())),
    setConfig(patch) {
      const c = normalizeConfig(store.read());
      if (patch && typeof patch === 'object') {
        if (validId(c, patch.provider)) c.provider = patch.provider;
        if (patch.visionProvider === '' || validId(c, patch.visionProvider)) c.visionProvider = patch.visionProvider;
        if (patch.speechProvider === '' || validId(c, patch.speechProvider)) c.speechProvider = patch.speechProvider;
        if (patch.models && typeof patch.models === 'object') for (const k of BUILTIN) if (typeof patch.models[k] === 'string') c.models[k] = patch.models[k].trim().slice(0, 200);
        if (typeof patch.endpoint === 'string') c.endpoint = patch.endpoint.trim().slice(0, 200);
        if (patch.key && typeof patch.key.value === 'string' && ['anthropic', 'gemini'].includes(patch.key.provider)) {
          let v = '';
          try {
            v = cleanKey(patch.key.value);
          } catch {
            return publicConfig(c);
          }
          if (v) c.keys[patch.key.provider] = store.encrypt(v);
          else delete c.keys[patch.key.provider];
        }
      }
      store.write(c);
      return publicConfig(c);
    },
    saveCustom(draft) {
      const c = normalizeConfig(store.read());
      try {
        const prev = draft.id ? c.custom.find((x) => x.id === draft.id) : null;
        const p = sanitizeCustom(draft, prev);
        c.custom = prev ? c.custom.map((x) => (x.id === p.id ? p : x)) : [...c.custom, p];
        if (typeof draft.key === 'string') {
          const v = cleanKey(draft.key);
          if (v) c.keys['c:' + p.id] = store.encrypt(v);
          else delete c.keys['c:' + p.id];
        } else if (prev && !sameServer(prev.baseUrl, p.baseUrl)) delete c.keys['c:' + p.id];
        if (draft.select) c.provider = 'custom:' + p.id;
        store.write(c);
        return { ok: true, id: p.id, config: publicConfig(c) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    deleteCustom(id) {
      const c = normalizeConfig(store.read());
      c.custom = c.custom.filter((x) => x.id !== id);
      delete c.keys['c:' + id];
      if (c.provider === 'custom:' + id) c.provider = 'anthropic';
      if (c.visionProvider === 'custom:' + id) c.visionProvider = '';
      if (c.speechProvider === 'custom:' + id) c.speechProvider = '';
      store.write(c);
      return publicConfig(c);
    },
    async ask(req) {
      if (!req || typeof req.text !== 'string') return { ok: false, error: 'Пустой запрос' };
      if (req.image && (typeof req.image.data !== 'string' || req.image.data.length > 8 * 1024 * 1024)) return { ok: false, error: 'Картинка слишком большая' };
      try {
        const c = normalizeConfig(store.read());
        let r = resolve(c, c.provider);
        if (req.image && r.p.vision === false) {
          if (!c.visionProvider) throw new Error(`«${r.p.name}» не понимает картинки. В настройках ИИ выбери, какой ИИ использовать для картинок.`);
          r = resolve(c, c.visionProvider);
        }
        if (r.needKey && !r.key) throw new Error(`Не указан ключ API для «${r.p.name}».`);
        return { ok: true, text: await run(r.p, r.key, req) };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
    async transcribe(req) {
      if (!req || typeof req.data !== 'string' || req.data.length > 20 * 1024 * 1024) return { ok: false, error: 'Запись слишком длинная' };
      try {
        return { ok: true, text: await transcribe(normalizeConfig(store.read()), req) };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
    async probe(q) {
      const c = normalizeConfig(store.read());
      try {
        let p;
        let key;
        if (q && q.draft) {
          const prev = q.draft.id ? c.custom.find((x) => x.id === q.draft.id) : null;
          p = sanitizeCustom(q.draft, prev);
          key = typeof q.draft.key === 'string' && q.draft.key.trim() ? cleanKey(q.draft.key) : prev && sameServer(prev.baseUrl, p.baseUrl) ? store.decrypt(c.keys['c:' + prev.id]) : '';
        } else {
          const r = resolve(c, (q && q.provider) || c.provider);
          p = r.p;
          key = r.key;
        }
        if (q && q.kind === 'models') return { ok: true, models: await listModels(p, key) };
        let keyInfo;
        if (isOpenRouter(p)) {
          if (!key) throw new Error('Вставь ключ OpenRouter (он начинается с sk-or-).');
          try {
            keyInfo = await openRouterKeyInfo(p, key);
          } catch (e) {
            if (e.status === 401) throw new Error(`401: OpenRouter не принял ключ${/^sk-or-/.test(key) ? '' : ' — ключ OpenRouter начинается с «sk-or-»'}. ${e.message.replace(/^401:\s*/, '')}`);
            throw e;
          }
        }
        const text = await run(p, key, { text: 'Ответь одним словом по-русски: «готово».', maxTokens: 40 });
        let vision;
        if (q && q.checkVision) {
          const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
          try {
            await run(p, key, { text: 'Какого цвета картинка? Одним словом.', image: { mime: 'image/png', data: png }, maxTokens: 20 });
            vision = true;
          } catch {
            vision = false;
          }
        }
        return { ok: true, text, vision, keyInfo };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    },
    async localModels() {
      const c = normalizeConfig(store.read());
      try {
        return { ok: true, models: (await listModels({ format: 'openai', baseUrl: c.endpoint || DEFAULTS.endpoint, auth: 'none' }, '')).map((m) => m.id) };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  };
}
