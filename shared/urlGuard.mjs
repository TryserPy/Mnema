// Проверка ссылки перед загрузкой чужой страницы (1.32, N2): сервер Refrain ИИ (/v1/extract) и приложение без входа
// (Electron, Android) скачивают по ней статью или субтитры. Защита от SSRF: только http(s) на стандартных портах,
// без логина в адресе, без внутренних адресов (localhost, 10.x, 192.168.x, 169.254.x, IPv6 ULA и link-local, .local
// и т. п.), после каждого перехода (redirect) — проверка заново. Чистые функции, без сети.

/** IPv4 из строки «a.b.c.d» (и десятичных/шестнадцатеричных форм вроде 0x7f.1, 2130706433). null — не IPv4. */
export function parseIPv4(host) {
  const h = String(host);
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    return n <= 0xffffffff ? [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255] : null;
  }
  const parts = h.split('.');
  if (parts.length < 2 || parts.length > 4) return null;
  const nums = [];
  for (const p of parts) {
    if (!/^(0x[0-9a-f]+|0[0-7]*|[1-9]\d*)$/i.test(p)) return null;
    nums.push(p.toLowerCase().startsWith('0x') ? parseInt(p, 16) : p.length > 1 && p[0] === '0' ? parseInt(p, 8) : Number(p));
  }
  // Короткие формы (127.1 = 127.0.0.1): последняя часть занимает оставшиеся байты.
  const last = nums.pop();
  const out = [...nums];
  const rest = 4 - nums.length;
  if (nums.some((x) => x > 255) || last >= 2 ** (8 * rest)) return null;
  for (let i = rest - 1; i >= 0; i--) out.push(Math.floor(last / 2 ** (8 * i)) & 255);
  return out;
}

/** Внутренний или служебный IPv4: свой компьютер, локальная сеть, облачные метаданные, CGNAT, мультикаст. */
export function privateIPv4([a, b]) {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Внутренний IPv6: ::, ::1, fc00::/7, fe80::/10, ::ffff:внутренний IPv4, 64:ff9b:: с внутренним IPv4. */
export function privateIPv6(host) {
  const h = String(host).replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::' || h === '::1' || /^0*:0*:0*:0*:0*:0*:0*:0*1?$/.test(h)) return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h)) return true;
  const v4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4) {
    const ip = parseIPv4(v4[1]);
    return !ip || privateIPv4(ip);
  }
  // ::ffff:7f00:1 — IPv4 в шестнадцатеричной записи
  const mapped = /^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return privateIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  }
  return false;
}

const BAD_SUFFIX = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|in-addr\.arpa|ip6\.arpa)$/i;

/**
 * Ссылка, которую можно скачать. ok: false — с понятной причиной по-русски.
 * Имя хоста без точки («router»), IP-адреса внутренних сетей и служебные зоны — нельзя.
 */
export function checkUrl(raw, maxChars = 2000) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, why: 'Вставь ссылку.' };
  if (text.length > maxChars) return { ok: false, why: 'Ссылка слишком длинная.' };
  let u;
  try {
    u = new URL(/^[a-z][\w+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    return { ok: false, why: 'Это не похоже на ссылку. Скопируй адрес страницы целиком.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, why: 'Подходят только ссылки http:// и https://.' };
  if (u.username || u.password) return { ok: false, why: 'Ссылки с логином и паролем не открываю.' };
  if (u.port && !((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80'))) return { ok: false, why: 'Ссылки с необычным портом не открываю.' };
  const host = u.hostname.replace(/\.$/, '').toLowerCase();
  if (!host) return { ok: false, why: 'В ссылке нет адреса сайта.' };
  const v4 = parseIPv4(host);
  if ((v4 && privateIPv4(v4)) || privateIPv6(host)) return { ok: false, why: 'Это адрес внутренней сети — его открыть нельзя.' };
  if (!v4 && !host.includes(':') && (!host.includes('.') || BAD_SUFFIX.test(host))) return { ok: false, why: 'Это адрес внутренней сети — его открыть нельзя.' };
  u.hash = '';
  return { ok: true, url: u.toString() };
}

/** id видео YouTube из ссылки (watch, youtu.be, shorts, embed, live, m. и music.). null — не YouTube. */
export function youtubeId(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
      id = m && m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
