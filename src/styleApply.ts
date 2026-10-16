// Применение стилей: один <style id="refrain-styles"> на всё и атрибуты data-ui-* / data-st-* на <html>.
// Порядок 1.31 (ApplyOrder в styleModel.ts): стиль → дополнения → кусочки CSS → мои правки.
// React-дерево при этом не перерисовывается: меняются только текст одного <style> и несколько атрибутов.
import { useSyncExternalStore } from 'react';
import { allMods } from './mods';
import { appearanceOf, classifyRole, type AppearanceFields } from './styleMigrate';
import { attrName, compileStyles, MINE_ID, type Compiled } from './styleSystem';
import { FONTS } from './themes';
import type { CssSnippet, Mod, StyleValue } from './types';

const STYLE_ID = 'refrain-styles';

type Layer = { mod: Mod; values?: Record<string, StyleValue> };
type ApplyInput = AppearanceFields & { cssSnippets: CssSnippet[] };

let lastRefs: unknown[] = [];
let current: Compiled = { css: '', attrs: {} };
let applied: string[] = []; // имена атрибутов, которые мы поставили на <html>
/** Черновик из редактора: пока открыт, показывается на настоящем интерфейсе; закрыли без сохранения — откат. */
let draft: Layer | null = null;
let lastSettings: ApplyInput | null = null;
const subs = new Set<() => void>();

/** Стиль и дополнения по порядку (сверху вниз), с их настройками, и мои правки — отдельно: они идут после кусочков CSS. */
export function styleStack(s: AppearanceFields, replace?: Layer | null): { stack: Layer[]; edits?: Mod } {
  const a = appearanceOf(s);
  const byId = new Map(allMods(s.customMods).map((m) => [m.id, m]));
  const ids = [...(byId.has(a.style) ? [a.style] : []), ...a.addons];
  const stack: Layer[] = [];
  let placed = false;
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) continue;
    if (replace && replace.mod.id === id) {
      stack.push({ mod: replace.mod, values: replace.values ?? s.styleValues[id] });
      placed = true;
    } else stack.push({ mod: m, values: s.styleValues[id] });
  }
  if (replace && !placed && replace.mod.id !== MINE_ID) {
    // Новый или ещё не включённый стиль в редакторе: стиль встаёт на место стиля, дополнение — после остальных.
    if (classifyRole(replace.mod) === 'style') {
      const i = stack.findIndex((l) => l.mod.id === a.style);
      if (i >= 0) stack.splice(i, 1, replace);
      else stack.unshift(replace);
    } else stack.push(replace);
  }
  const edits = replace && replace.mod.id === MINE_ID ? replace.mod : s.myStyle;
  return { stack, edits };
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

function recompute(s: ApplyInput) {
  const { stack, edits } = styleStack(s, draft);
  for (const l of stack) if (l.mod.font) void FONTS.find((f) => f.id === l.mod.font)?.load?.();
  write(compileStyles(stack, s.cssSnippets, edits));
}

/** Применить стиль, дополнения, кусочки CSS и правки (вызывается при смене настроек; если ссылки на данные те же — ничего не делает). */
export function applyStyles(s: ApplyInput) {
  const refs = [s.modsOn, s.customMods, s.styleValues, s.cssSnippets, s.myStyle, s.appearance];
  lastSettings = s;
  if (refs.length === lastRefs.length && refs.every((r, i) => r === lastRefs[i])) return;
  lastRefs = refs;
  recompute(s);
}

/** Показать стиль из редактора прямо в интерфейсе (null — убрать, всё как было). */
export function setStylePreview(p: Layer | null) {
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
