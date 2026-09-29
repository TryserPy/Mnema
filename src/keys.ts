// Горячие клавиши: действия, клавиши по умолчанию и сравнение нажатия.
// Буквы сравниваются по физической клавише (e.code), поэтому работают и в русской раскладке.
import type { Settings } from './types';

export type KeyAction =
  | 'reveal'
  | 'again'
  | 'hard'
  | 'good'
  | 'easy'
  | 'exitReview'
  | 'explain'
  | 'handAnswer'
  | 'voiceAnswer'
  | 'learnToday'
  | 'goToday'
  | 'newTopic'
  | 'toggleSidebar'
  | 'insertFormula'
  | 'handFormula'
  | 'insertDrawing'
  | 'noteFull'
  | 'makeCard'
  | 'toggleImportant'
  | 'miniReview'
  | 'palette'
  | 'goHomework'
  | 'goStats'
  | 'goSettings'
  | 'markText'
  | 'linkText';

export interface KeyDef {
  id: KeyAction;
  group: 'Повторение' | 'Везде' | 'Конспект' | 'Из любой программы';
  label: string;
  def: string;
  needs?: 'ai' | 'handwriting' | 'tray' | 'voice';
}

export const KEY_DEFS: KeyDef[] = [
  { id: 'reveal', group: 'Повторение', label: 'Показать ответ', def: 'Space' },
  { id: 'again', group: 'Повторение', label: 'Снова / Не помню', def: '1' },
  { id: 'hard', group: 'Повторение', label: 'Трудно', def: '2' },
  { id: 'good', group: 'Повторение', label: 'Хорошо / Помню', def: '3' },
  { id: 'easy', group: 'Повторение', label: 'Легко', def: '4' },
  { id: 'exitReview', group: 'Повторение', label: 'Закончить повторение', def: 'Escape' },
  { id: 'explain', group: 'Повторение', label: '«Объясни иначе»', def: 'X', needs: 'ai' },
  { id: 'handAnswer', group: 'Повторение', label: 'Ответить от руки', def: 'H', needs: 'handwriting' },
  { id: 'voiceAnswer', group: 'Повторение', label: 'Ответить голосом (нажми ещё раз — стоп)', def: 'V', needs: 'voice' },
  { id: 'palette', group: 'Везде', label: 'Поиск и команды', def: 'Ctrl+P' },
  { id: 'learnToday', group: 'Везде', label: 'Начать повторение на сегодня', def: 'Ctrl+L' },
  { id: 'goToday', group: 'Везде', label: 'Перейти на «Сегодня»', def: 'Ctrl+1' },
  { id: 'goHomework', group: 'Везде', label: 'Открыть «Домашку»', def: 'Ctrl+2' },
  { id: 'goStats', group: 'Везде', label: 'Открыть статистику', def: 'Ctrl+3' },
  { id: 'goSettings', group: 'Везде', label: 'Открыть настройки', def: 'Ctrl+,' },
  { id: 'newTopic', group: 'Везде', label: 'Новая тема (в открытом предмете)', def: 'Ctrl+N' },
  { id: 'toggleSidebar', group: 'Везде', label: 'Скрыть или показать левую панель', def: 'Ctrl+\\' },
  { id: 'toggleImportant', group: 'Везде', label: 'Отметить тему важной ★', def: 'Ctrl+D' },
  { id: 'insertFormula', group: 'Конспект', label: 'Вставить формулу', def: 'Ctrl+M' },
  { id: 'handFormula', group: 'Конспект', label: 'Формула от руки', def: 'Ctrl+Shift+M', needs: 'ai' },
  { id: 'insertDrawing', group: 'Конспект', label: 'Вставить рисунок', def: 'Ctrl+Shift+D' },
  { id: 'noteFull', group: 'Конспект', label: 'Конспект на весь экран', def: 'Ctrl+Shift+F' },
  { id: 'makeCard', group: 'Конспект', label: 'Карточка из выделенного', def: 'Ctrl+K' },
  { id: 'markText', group: 'Конспект', label: 'Маркер на выделенном', def: 'Ctrl+Shift+H' },
  { id: 'linkText', group: 'Конспект', label: 'Ссылка из выделенного', def: 'Ctrl+Shift+L' },
  { id: 'miniReview', group: 'Из любой программы', label: 'Быстро повторить 5 карточек', def: 'Ctrl+Alt+M', needs: 'tray' }
];

const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Backslash: '\\',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down'
};

/** Клавиша без модификаторов по физическому коду. */
function baseKey(e: Pick<KeyboardEvent, 'code' | 'key'>): string | null {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return c.slice(6);
  if (/^F\d{1,2}$/.test(c)) return c;
  if (CODE_NAMES[c]) return CODE_NAMES[c];
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** Нажатие → строка вида «Ctrl+Shift+K». null — нажаты только модификаторы. */
export function comboFromEvent(e: Pick<KeyboardEvent, 'code' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  const k = baseKey(e);
  if (!k) return null;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return [...mods, k].join('+');
}

export function keyFor(settings: Pick<Settings, 'keys'>, id: KeyAction): string {
  const custom = settings.keys?.[id];
  return custom === undefined ? KEY_DEFS.find((d) => d.id === id)!.def : custom;
}

/** Совпадает ли нажатие с клавишей действия. Пустая строка — клавиша отключена. */
export function matches(e: KeyboardEvent, settings: Pick<Settings, 'keys'>, id: KeyAction): boolean {
  const want = keyFor(settings, id);
  if (!want) return false;
  return comboFromEvent(e) === want;
}

const NICE: Record<string, string> = { Space: 'Пробел', Escape: 'Esc', Enter: 'Enter', Left: '←', Right: '→', Up: '↑', Down: '↓', Backspace: '⌫' };

/** Для показа: «Ctrl + Shift + M». */
export function prettyCombo(combo: string): string[] {
  if (!combo) return [];
  return combo.split('+').map((p) => NICE[p] ?? p);
}

/** Строка для Electron globalShortcut. */
export function toAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((p) => (p === 'Ctrl' ? 'CommandOrControl' : p === 'Space' ? 'Space' : p === 'Escape' ? 'Esc' : p))
    .join('+');
}

/** Одна и та же клавиша у двух действий в одной группе (или в группе «Везде» и любой другой). */
export function conflicts(settings: Pick<Settings, 'keys'>): Map<KeyAction, KeyAction> {
  const out = new Map<KeyAction, KeyAction>();
  for (const a of KEY_DEFS)
    for (const b of KEY_DEFS) {
      if (a.id >= b.id) continue;
      const ka = keyFor(settings, a.id);
      if (!ka || ka !== keyFor(settings, b.id)) continue;
      const clash = a.group === b.group || a.group === 'Везде' || b.group === 'Везде';
      if (clash) {
        out.set(a.id, b.id);
        out.set(b.id, a.id);
      }
    }
  return out;
}

/** Сейчас фокус в поле ввода или редакторе — одиночные клавиши не перехватываем. */
export function typingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'MATH-FIELD' || el.isContentEditable;
}
