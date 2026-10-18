// Сообщения окна «Добавить из учебника» (1.33): не столбик жёлтых плашек, а одна главная проблема с одним действием,
// остальное — свёрнуто. Одинаковые причины на разных страницах — одной строкой («Стр. 1, 2: …»),
// противоречивое вместе не показывается (например, «не удаётся подключиться» и «прочитано без интернета» —
// теперь «ИИ на компьютере не запущен — страница прочитана встроенным распознаванием»).
import { aiFailure, type AiFailure } from './aiFailure';
import type { PageResult } from './textbookText';

export type MsgLevel = 'error' | 'warn' | 'info';
/** retry — прочитать заново; settings — настройки ИИ; signin — войти в Refrain ИИ; reshoot — переснять/заменить фото. */
export type MsgAction = 'retry' | 'settings' | 'signin' | 'reshoot';

export interface TbMessage {
  key: string;
  level: MsgLevel;
  pages: number[];
  text: string;
  action?: MsgAction;
}

const RANK: Record<MsgLevel, number> = { error: 0, warn: 1, info: 2 };

export const pagesLabel = (p: number[]): string => (p.length === 0 ? '' : p.length === 1 ? `Стр. ${p[0]}` : `Стр. ${p.join(', ')}`);

/** Совет для скриншота вместо «включи свет» и «сними камерой». */
export const SCREEN_TEXT =
  'Это снимок экрана, а не фото страницы учебника: переписку, тёмную тему и мелкий шрифт распознавание читает плохо. Для конспекта сфотографируй страницу учебника — или вставь текст, если он у тебя уже есть.';

/** Причина отката ИИ — коротко и без противоречий с тем, что было дальше. */
function fallbackText(why: string, f: AiFailure): { text: string; action?: MsgAction; level: MsgLevel } {
  const tail = 'Поэтому страница прочитана встроенным распознаванием (без ИИ) — проверь текст.';
  switch (f.kind) {
    case 'local':
      return { text: `ИИ на компьютере не отвечает: запусти сервер в LM Studio или Ollama — или выбери другой ИИ. ${tail}`, action: 'settings', level: 'warn' };
    case 'offline':
      return { text: `Нет связи с ИИ (интернет или сервер недоступен). ${tail}`, action: 'retry', level: 'warn' };
    case 'setup':
      return { text: `ИИ не подключён: войди в Refrain ИИ или добавь свой ключ. ${tail}`, action: 'signin', level: 'warn' };
    case 'session':
      return { text: `Вход в Refrain ИИ устарел — войди заново. ${tail}`, action: 'signin', level: 'warn' };
    case 'key':
    case 'money':
      return { text: `${why.replace(/\.?\s*$/, '.')} ${tail}`, action: 'settings', level: 'warn' };
    case 'limit':
      return { text: `${why.replace(/\.?\s*$/, '.')} ${tail}`, level: 'warn' };
    case 'busy':
    case 'timeout':
      return { text: `ИИ сейчас не ответил (${why.replace(/\.\s*$/, '')}). ${tail}`, action: 'retry', level: 'warn' };
    default:
      return { text: `ИИ не справился: ${why.replace(/\.\s*$/, '')}. ${tail}`, action: 'retry', level: 'warn' };
  }
}

/** Собрать сообщения: главное первым. weak — «прочитано неуверенно» без отдельного совета. */
export function textbookMessages(o: {
  errors: string[];
  notes?: string[];
  aiDown?: string;
  mergeFail?: string;
  buildNote?: string;
  results: Pick<PageResult, 'n' | 'advice' | 'note' | 'aiFallback' | 'screen' | 'quality'>[];
  weak?: (r: Pick<PageResult, 'quality'>) => boolean;
}): TbMessage[] {
  const groups = new Map<string, TbMessage>();
  const add = (m: Omit<TbMessage, 'pages'>, page?: number) => {
    const g = groups.get(m.key);
    if (g) {
      if (page !== undefined && !g.pages.includes(page)) g.pages.push(page);
      return;
    }
    groups.set(m.key, { ...m, pages: page === undefined ? [] : [page] });
  };

  // Страница не прочиталась совсем — ошибка.
  for (const e of o.errors) {
    const m = /^Стр\.\s*(\d+):\s*([\s\S]*)$/.exec(e);
    const text = (m ? m[2] : e).replace(/^./, (c) => c.toUpperCase());
    add({ key: 'err:' + text, level: 'error', text, action: 'reshoot' }, m ? Number(m[1]) : undefined);
  }

  // ИИ не ответил: одна причина на все страницы с ней (и на всё чтение, если ИИ некому было спросить).
  const fallbacks = o.results.filter((r) => r.aiFallback);
  if (o.aiDown && !fallbacks.length) {
    const f = fallbackText(o.aiDown, aiFailure({ ok: false, error: o.aiDown }));
    add({ key: 'ai:' + f.text, ...f });
  }
  for (const r of fallbacks) {
    const f = fallbackText(r.aiFallback!, aiFailure({ ok: false, error: r.aiFallback! }));
    add({ key: 'ai:' + f.text, ...f }, r.n);
  }

  // Снимок плохой: совет переснять. Скриншот — свой совет вместо «включи свет».
  for (const r of o.results) {
    if (r.screen && (r.advice?.length || (o.weak && o.weak(r)))) {
      add({ key: 'screen', level: 'warn', text: SCREEN_TEXT, action: 'reshoot' }, r.n);
      continue;
    }
    if (r.advice?.length) {
      const text = r.advice.map((a) => a.text).join(' ');
      add({ key: 'adv:' + text, level: 'warn', text, action: 'reshoot' }, r.n);
    } else if (o.weak && o.weak(r)) {
      add({ key: 'weak', level: 'info', text: `Прочитано не очень уверенно. Проверь текст — или сфотографируй страницу ещё раз: ровнее, ближе и при хорошем свете.`, action: 'reshoot' }, r.n);
    }
  }

  if (o.mergeFail) add({ key: 'merge', level: 'warn', text: `Не удалось составить один конспект по всему параграфу (${o.mergeFail.replace(/\.\s*$/, '')}). Показан подробный текст страниц — его можно сократить самому или прочитать заново.`, action: 'retry' });

  // Пояснения без проблемы (разворот, «без ИИ конспект грубее»).
  for (const r of o.results) if (r.note) add({ key: 'note:' + r.note, level: 'info', text: r.note }, r.n);
  for (const t of o.notes ?? []) add({ key: 'note:' + t, level: 'info', text: t });
  if (o.buildNote) add({ key: 'build', level: 'info', text: o.buildNote });

  const out = [...groups.values()];
  for (const m of out) m.pages.sort((a, b) => a - b);
  // Устойчивая сортировка: уровень, затем порядок появления.
  return out.map((m, i) => ({ m, i })).sort((a, b) => RANK[a.m.level] - RANK[b.m.level] || a.i - b.i).map((x) => x.m);
}
