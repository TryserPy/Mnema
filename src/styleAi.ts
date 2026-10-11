// Стили с помощью ИИ: что мы просим у модели, как разбираем ответ (он бывает кривым) и как делаем из него безопасный стиль.
// Главное правило: ответ ИИ — недоверенные данные, как файл от одноклассника. Из него берётся только JSON, дальше — cleanMod
// (переменные, атрибуты, настройки, CSS через sanitizeCss) и проверка читаемости. Кода в стиле нет и быть не может.
// Чистые функции — их проверяют тесты (v130-styles.test.ts); запрос к модели — в самом конце файла (askStyle).
import { humanError } from './ai';
import { aiSystem } from './aiTasks';
import { sanitizeCss } from './safeCss';
import { fixContrast, type BaseAppearance, type Fix } from './styleContrast';
import { API_CLASSES, API_PARTS, API_ROOT_ATTRS, API_VARS } from './styleApi';
import { cleanMod, STYLE_ATTRS } from './styleSystem';
import { FONTS, THEMES } from './themes';
import type { AppData, Mod, SettingsSection } from './types';

/** Сколько знаков CSS принимаем от ИИ: файлом делиться не нужно, а огромный ответ — это ошибка модели. */
export const AI_MAX_CSS = 12000;
/** Сколько знаков ответа вообще разбираем. */
export const AI_MAX_REPLY = 60000;

// ---------- Что просим ----------

/** Справочник для ИИ: переменные, атрибуты, классы — прямо из styleApi.ts и styleSystem.ts, а не вручную (поэтому не устаревает). */
export function styleReference(): string {
  const lines: string[] = [];
  lines.push('ЦВЕТОВЫЕ СХЕМЫ (look.light / look.dark): светлые — ' + THEMES.filter((t) => !t.dark).map((t) => t.id).join(', ') + '; тёмные — ' + THEMES.filter((t) => t.dark).map((t) => t.id).join(', ') + '.');
  lines.push('ШРИФТЫ (look.font): ' + FONTS.map((f) => f.id).join(', ') + '. look.headFont: literata (с засечками) или same. look.radius: sharp, normal, round. look.background: plain, dots, grid, lines. look.style: modern, classic.');
  lines.push('');
  lines.push('ПЕРЕМЕННЫЕ (vars.light и vars.dark — отдельно для светлой и тёмной темы). Цвета — только #RRGGBB:');
  for (const g of API_VARS) {
    lines.push(`[${g.title}]`);
    for (const v of g.vars) lines.push(`${v.name}${v.def ? ` (обычно ${v.def})` : ''} — ${v.doc}`);
  }
  lines.push('');
  lines.push('АТРИБУТЫ РАСКЛАДКИ (attrs): ' + Object.entries(STYLE_ATTRS).map(([k, d]) => `${k}: ${d.options.map((o) => o.value).join(' | ')} (обычно ${d.default})`).join('; ') + '.');
  lines.push('');
  lines.push('КЛАССЫ ДЛЯ css: ' + API_CLASSES.map((c) => `${c.name} — ${c.doc}`).join(' '));
  lines.push('Метки частей: ' + API_PARTS.map((p) => `[data-part='${p.name}']`).join(', ') + '. Атрибуты на <html>: ' + API_ROOT_ATTRS.map((a) => a.name).join(', ') + '. Правила для тёмной темы пиши так: :root[data-theme=\'dark\'] .card { … }.');
  return lines.join('\n');
}

/** Системный текст для ИИ (с указаниями ученика к задаче «style» через aiSystem). */
export function styleSystemPrompt(): string {
  return aiSystem(
    'style',
    [
      'Ты — дизайнер оформления приложения для повторения учебных карточек Refrain (его используют школьники). Тебе описывают, как должно выглядеть приложение, а ты возвращаешь СТИЛЬ.',
      'Верни ТОЛЬКО один JSON-объект — без пояснений до и после, без ```. Формат (все поля, кроме name, необязательны):',
      '{"name":"короткое название","description":"одно предложение","icon":"один эмодзи","look":{"light":"air","dark":"night","font":"onest"},"accent":"#4C5BD4","density":"normal","fontScale":1,"vars":{"light":{"--bg":"#F5F6F8"},"dark":{"--bg":"#101216"}},"attrs":{"cards":"flat"},"css":".hero { … }"}',
      '',
      'Правила:',
      '1. Меняй только то, что просят, но цвета задавай согласованно и для светлой (vars.light), и для тёмной (vars.dark) темы: в светлой — светлые фоны и тёмный текст, в тёмной — наоборот.',
      '2. Если меняешь фон (--bg), задай и --side, --surface, --surface-2, --sunken, --line, --line-2 в тон ему, а также --ink, --ink-2, --muted.',
      '3. Текст должен читаться: контраст --ink с --bg и --surface не ниже 4.5:1, --muted и --ink-2 тоже. Приложение проверит и подправит, но лучше сразу.',
      '4. Главный цвет — accent (одинаковый для обеих тем) или vars.*["--accent"] (свой для темы).',
      '5. Размеры — со значениями px или rem, например "--radius":"24px". Не выдумывай переменные: бери только из справочника.',
      '6. css — только если переменных и атрибутов не хватает; используй классы из справочника. Нельзя: url() на картинки из интернета, @import, @font-face, expression, скрипты. Не прячи важные части (display:none для .sidebar, .main, .app), не растягивай ничего на весь экран поверх интерфейса. Не длиннее 3000 знаков.',
      '7. Шрифты — только из справочника (look.font, look.headFont) или системные (serif, sans-serif, monospace, Georgia, Arial). Скачивать шрифты нельзя.',
      '8. Анимации умеренные; если просят «без анимаций» — attrs.anim = "off".',
      '9. Если дан текущий стиль, измени его по просьбе и верни стиль целиком.',
      '',
      'СПРАВОЧНИК',
      styleReference()
    ].join('\n')
  );
}

/** Сжатый вид стиля для запроса «доработай»: без картинки фона и служебных полей. */
export function styleForPrompt(m: Mod): string {
  const { id: _id, where: _where, settings: _settings, bg, ...rest } = m;
  const out: Record<string, unknown> = { ...rest };
  if (bg) {
    const { src: _src, ...params } = bg;
    if (Object.keys(params).length) out.bg = params;
  }
  return JSON.stringify(out).slice(0, 14000);
}

export function styleUserText(wish: string, current?: Mod): string {
  const w = wish.trim().replace(/\s+/g, ' ').slice(0, 800);
  return current ? `Текущий стиль (JSON):\n${styleForPrompt(current)}\n\nПросьба ученика: ${w}\nВерни изменённый стиль целиком.` : `Просьба ученика: ${w}`;
}

// ---------- Разбор ответа ----------

/** Убрать из «почти JSON» комментарии и запятые перед закрывающей скобкой — вне строк. */
function tidy(s: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      // Настоящий перевод строки внутри строки JSON (так модели пишут css) — недопустим; заменяем на \\n.
      if (ch === '\n') out += '\\n';
      else if (ch === '\t') out += '\\t';
      else out += ch;
      if (ch === '\\') out += s[++i] ?? '';
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && s[i + 1] === '/' && s[i - 1] !== ':') {
      while (i < s.length && s[i] !== '\n') i++;
    } else if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      i = end < 0 ? s.length : end + 1;
    } else if (ch === ',') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '}' || s[j] === ']') continue; // лишняя запятая
      out += ch;
    } else out += ch;
  }
  return out;
}

/** Закрыть то, что обрезано на полуслове: открытую строку, скобки. */
function close(prefix: string): string {
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let s = prefix;
  if (inStr) s += prefix.endsWith('\\') ? '\\"' : '"';
  s = s.replace(/[\s,]+$/, '');
  if (/:\s*$/.test(s)) s += 'null';
  return s + stack.reverse().join('');
}

/** Позиции, где можно безопасно отрезать обрезанный JSON: после «{», «[» и перед «,» (вне строк). */
function cutPoints(s: string): number[] {
  const pts: number[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') pts.push(i + 1);
    else if (ch === ',') pts.push(i);
  }
  return pts;
}

function parseObject(s: string): Record<string, unknown> | undefined {
  const tryParse = (t: string) => {
    try {
      const v = JSON.parse(t) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  const text = tidy(s);
  const whole = tryParse(text);
  if (whole) return whole;
  // Лишний текст после объекта: берём до закрывающей скобки первого объекта.
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      const v = tryParse(text.slice(0, i + 1));
      if (v) return v;
      break;
    }
  }
  // Ответ обрезали: закрываем и, если не выходит, отступаем назад по запятым.
  const pts = cutPoints(text);
  for (let k = pts.length; k >= 0; k--) {
    const v = tryParse(close(k === pts.length ? text : text.slice(0, pts[k])));
    if (v && Object.keys(v).length) return v;
    if (pts.length - k > 400) break;
  }
  return undefined;
}

const STYLE_KEYS = ['name', 'description', 'look', 'accent', 'density', 'fontScale', 'vars', 'attrs', 'css', 'font', 'bg'];

/** Достать JSON-объект из ответа модели: в ```json-обёртке, с текстом вокруг, с лишними запятыми, обрезанный. undefined — не нашли. */
export function extractJson(text: string): Record<string, unknown> | undefined {
  const t = String(text ?? '').slice(0, AI_MAX_REPLY).replace(/\r/g, '');
  const candidates: string[] = [];
  for (const m of t.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)(?:```|$)/g)) candidates.push(m[1]);
  candidates.push(t);
  let fallback: Record<string, unknown> | undefined;
  let attempts = 0;
  for (const c of candidates) {
    for (let from = c.indexOf('{'); from >= 0 && from < c.length && attempts < 6; from = c.indexOf('{', from + 1)) {
      attempts++;
      const obj = parseObject(c.slice(from));
      if (!obj) continue;
      if (STYLE_KEYS.some((k) => k in obj)) return obj;
      // {"style": {…}} и подобное: объект внутри единственного поля
      const inner = Object.values(obj).find((v) => v && typeof v === 'object' && !Array.isArray(v) && STYLE_KEYS.some((k) => k in (v as object)));
      if (inner) return inner as Record<string, unknown>;
      fallback ??= obj;
      break; // дальше внутри этого же объекта искать нечего
    }
  }
  return fallback;
}

/** CSS без хвоста с незакрытой скобкой: обрезанное посреди правила выбрасывается. */
export function balanceCss(css: string, max = AI_MAX_CSS): string {
  const s = css.slice(0, max * 2);
  let depth = 0;
  let inStr: string | null = null;
  let good = 0;
  let inComment = false;
  for (let i = 0; i < s.length && i < max; i++) {
    const ch = s[i];
    if (inComment) {
      if (ch === '*' && s[i + 1] === '/') {
        inComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && s[i + 1] === '*') {
      inComment = true;
      i++;
    } else if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      if (--depth < 0) return s.slice(0, good).trim();
      if (depth === 0) good = i + 1;
    } else if (ch === ';' && depth === 0) good = i + 1; // @import…; — в корне
  }
  return s.slice(0, good).trim();
}

// Правила, которые превращают приложение в пустой экран, — для ИИ они лишние (ошибка модели, а не замысел).
const GLOBAL_SELECTOR = /^(?:\*|html|body|:root|#root|\.app|\.main|\.sidebar|main|\[data-part=['"]?(?:app|main|sidebar)['"]?\])$/i;
const KILLER_DECL = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?|pointer-events\s*:\s*none|position\s*:\s*(?:fixed|absolute)|transform\s*:|clip-path\s*:|content\s*:|width\s*:\s*0|height\s*:\s*0|overflow\s*:\s*hidden\s*!important)\b/i;

/** Убрать правила, которые прячут или закрывают весь интерфейс (display:none у body/.app/.main/.sidebar и т. п.). */
export function dropGlobalHiding(css: string): { css: string; dropped: number } {
  let dropped = 0;
  const out = css.replace(/([^{}@]+)\{([^{}]*)\}/g, (all, sel: string, body: string) => {
    const selectors = sel.split(',').map((x) => x.trim());
    if (selectors.some((x) => GLOBAL_SELECTOR.test(x)) && KILLER_DECL.test(';' + body)) {
      dropped++;
      return '';
    }
    return all;
  });
  return { css: out, dropped };
}

export interface AiStyleResult {
  mod: Mod;
  /** Что мы поправили или выбросили из ответа — для показа ученику. */
  notes: string[];
  fixes: Fix[];
}

const count = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o).length : 0);

/** Ответ ИИ → безопасный стиль. Бросает понятную ошибку по-русски, если стиля в ответе нет. */
export function parseAiStyle(text: string, opts: { id: string; fallbackName?: string; base: BaseAppearance }): AiStyleResult {
  const obj = extractJson(text);
  if (!obj) throw new Error('ИИ ответил не стилем (в ответе нет данных). Попробуй сказать иначе или нажми «Ещё раз».');
  const notes: string[] = [];
  const raw: Record<string, unknown> = { ...obj };
  if (typeof raw.name !== 'string' || !raw.name.trim()) raw.name = opts.fallbackName?.trim().slice(0, 50) || 'Стиль от ИИ';
  // vars без деления на светлую и тёмную темы — значит, для обеих.
  const v = raw.vars as Record<string, unknown> | undefined;
  if (Array.isArray(v)) delete raw.vars;
  else if (v && typeof v === 'object' && !('light' in v) && !('dark' in v)) raw.vars = { light: v, dark: v };
  // Чужие картинки и «обещания» не принимаем: ИИ не может подкладывать картинку фона.
  if (raw.bg && typeof raw.bg === 'object') raw.bg = { ...(raw.bg as object), src: undefined };
  let css = typeof raw.css === 'string' ? raw.css : '';
  if (css) {
    const before = css.length;
    css = balanceCss(css);
    if (css.length < before) notes.push(before > AI_MAX_CSS ? 'CSS был слишком длинным — лишнее отрезано.' : 'Обрезанный на полуслове CSS урезан до целых правил.');
    const g = dropGlobalHiding(css);
    if (g.dropped) notes.push('Выброшены правила, которые прятали весь интерфейс.');
    css = g.css;
    const clean = sanitizeCss(css);
    if (clean !== css) notes.push('Из CSS убраны запрещённые части: ссылки в интернет, @import и подобное.');
    raw.css = css;
  }
  const mod = cleanMod(raw, opts.id, 'ИИ');
  if (!mod) throw new Error('В ответе ИИ нет названия стиля. Попробуй ещё раз.');
  mod.icon = mod.icon === '📄' ? '✨' : mod.icon;
  const had = count((raw.vars as Record<string, unknown> | undefined)?.light) + count((raw.vars as Record<string, unknown> | undefined)?.dark);
  const kept = count(mod.vars?.light) + count(mod.vars?.dark);
  if (had > kept) notes.push(`Пропущено переменных с неверными именами или значениями: ${had - kept}.`);
  if (raw.attrs && count(raw.attrs) > count(mod.attrs)) notes.push('Часть настроек раскладки не из списка — пропущена.');
  const effect = mod.vars || mod.attrs || mod.css?.trim() || mod.look || mod.accent || mod.density || mod.fontScale;
  if (!effect) throw new Error('ИИ не придумал никаких изменений. Опиши подробнее: цвета, шрифт, углы, расположение.');
  const fixed = fixContrast(mod, opts.base);
  if (fixed.fixes.length) notes.push(`Подправлен цвет текста там, где он плохо читался: ${fixed.fixes.length}.`);
  return { mod: fixed.mod, notes, fixes: fixed.fixes };
}

// ---------- Запрос к модели ----------

export type AiReady = { ok: true } | { ok: false; hint: string; go?: SettingsSection };

/** Можно ли сейчас спросить ИИ; если нет — что делать (понятно, куда зайти). */
export async function aiReady(data: AppData): Promise<AiReady> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) return { ok: false, hint: 'ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере (веб-версия без сервера ИИ не умеет).' };
  if (!data.settings.features.ai) return { ok: false, hint: 'ИИ-помощник выключен. Включи его: Настройки → Возможности → «ИИ-помощник», потом добавь ключ в разделе «ИИ-помощник».', go: 'features' };
  try {
    const cfg = await api.aiGetConfig?.();
    if (cfg) {
      const p = cfg.provider;
      const custom = p.startsWith('custom:') ? cfg.custom.find((x) => 'custom:' + x.id === p) : undefined;
      const ok = p === 'anthropic' || p === 'gemini' ? cfg.hasKey[p] : p === 'local' ? true : custom ? custom.hasKey || custom.auth === 'none' : true;
      if (!ok) return { ok: false, hint: 'У ИИ-помощника нет ключа. Зайди в Настройки → ИИ-помощник, вставь ключ (там подсказано, где его взять) — и возвращайся.', go: 'ai' };
    }
  } catch {
    /* не вышло прочитать настройки — пусть ответит сам запрос */
  }
  return { ok: true };
}

/** Спросить ИИ и получить безопасный стиль. Бросает Error с понятным текстом. */
export async function askStyle(wish: string, opts: { id: string; base: BaseAppearance; current?: Mod }): Promise<AiStyleResult> {
  const api = window.mnemaApi;
  if (!api?.aiAsk) throw new Error('ИИ-помощник работает в приложении для Windows, Linux, на телефоне и в браузере.');
  const r = await api.aiAsk({ system: styleSystemPrompt(), text: styleUserText(wish, opts.current), maxTokens: 4000 });
  if (!r.ok) throw new Error(humanError(r.error));
  if (!r.text?.trim()) throw new Error('Модель вернула пустой ответ. Попробуй ещё раз.');
  return parseAiStyle(r.text, { id: opts.id, fallbackName: opts.current?.name ?? wish.slice(0, 40), base: opts.base });
}
