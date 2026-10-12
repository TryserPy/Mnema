// Применение стилей к окну: один <style id="refrain-styles"> на всё (стили сверху вниз + сниппеты) и атрибуты data-ui-* / data-st-* на <html>.
// React-дерево при этом не перерисовывается: меняются только текст одного <style> и несколько атрибутов.
import { useSyncExternalStore } from 'react';
import { allMods } from './mods';
import { attrName, compileStyles, MINE_ID, type Compiled } from './styleSystem';
import { FONTS } from './themes';
import type { CssSnippet, Mod, Settings, StyleValue } from './types';

const STYLE_ID = 'refrain-styles';

let lastRefs: unknown[] = [];
let current: Compiled = { css: '', attrs: {} };
let applied: string[] = []; // имена атрибутов, которые мы поставили на <html>
/** Черновик из редактора: пока открыт, показывается на настоящем интерфейсе; закрыли без сохранения — откат. */
let draft: { mod: Mod; values?: Record<string, StyleValue> } | null = null;
let lastSettings: Pick<Settings, 'modsOn' | 'customMods' | 'styleValues' | 'cssSnippets' | 'myStyle'> | null = null;
const subs = new Set<() => void>();

/** Включённые стили по порядку (сверху вниз), с их настройками. */
export function styleStack(s: Pick<Settings, 'modsOn' | 'customMods' | 'styleValues'> & { myStyle?: Mod }, replace?: { mod: Mod; values?: Record<string, StyleValue> } | null) {
  const byId = new Map(allMods(s.customMods).map((m) => [m.id, m]));
  const out: { mod: Mod; values?: Record<string, StyleValue> }[] = [];
  const seen = new Set<string>();
  for (const id of s.modsOn) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = byId.get(id);
    if (!m) continue;
    if (replace && replace.mod.id === id) out.push({ mod: replace.mod, values: replace.values ?? s.styleValues[id] });
    else out.push({ mod: m, values: s.styleValues[id] });
  }
  if (replace && !seen.has(replace.mod.id) && replace.mod.id !== MINE_ID) out.push({ mod: replace.mod, values: replace.values });
  // «Мой вид» — последним: правки из «Настроить текущий» перекрывают любые включённые стили.
  if (replace && replace.mod.id === MINE_ID) out.push({ mod: replace.mod, values: replace.values });
  else if (s.myStyle) out.push({ mod: s.myStyle });
  return out;
}

function write(c: Compiled) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== c.css) el.textContent = c.css;
  const root = document.documentElement;
  const next = Object.entries(c.attrs).map(([k, v]) => [attrName(k), v] as const);
  for (const name of applied) if (!next.some(([n]) => n === name)) root.removeAttribute(name);
  for (const [n, v] of next) if (root.getAttribute(n) !== v) root.setAttribute(n, v);
  applied = next.map(([n]) => n);
  const changed = JSON.stringify(c.attrs) !== JSON.stringify(current.attrs);
  current = c;
  if (changed) subs.forEach((f) => f());
}

function recompute(s: NonNullable<typeof lastSettings>) {
  const stack = styleStack(s, draft);
  for (const l of stack) if (l.mod.font) void FONTS.find((f) => f.id === l.mod.font)?.load?.();
  write(compileStyles(stack, s.cssSnippets as CssSnippet[]));
}

/** Применить включённые стили (вызывается при смене настроек; если ссылки на данные те же — ничего не делает). */
export function applyStyles(s: Pick<Settings, 'modsOn' | 'customMods' | 'styleValues' | 'cssSnippets' | 'myStyle'>) {
  const refs = [s.modsOn, s.customMods, s.styleValues, s.cssSnippets, s.myStyle];
  lastSettings = s;
  if (refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i])) return;
  lastRefs = refs;
  recompute(s);
}

/** Показать стиль из редактора прямо в интерфейсе (null — убрать, всё как было). */
export function setStylePreview(p: { mod: Mod; values?: Record<string, StyleValue> } | null) {
  draft = p;
  if (lastSettings) recompute(lastSettings);
}

/** Атрибуты оформления, которые сейчас выставили включённые стили. */
export function currentStyleAttrs(): Record<string, string> {
  return current.attrs;
}

/** Реакция интерфейса на атрибут оформления (например, узкая панель в Sidebar). */
export function useStyleAttr(name: string): string | undefined {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current.attrs[name]
  );
}

/** Для тестов: сбросить состояние. */
export function _resetStyleApply() {
  lastRefs = [];
  current = { css: '', attrs: {} };
  applied = [];
  draft = null;
  lastSettings = null;
}
