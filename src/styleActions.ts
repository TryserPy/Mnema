// Действия над стилями (включить, порядок, значения настроек): отдельно от интерфейса, чтобы их можно было проверять тестами.
import { getData, updateSettings } from './store';
import { FONTS } from './themes';
import type { Mod, StyleValue } from './types';

/** Включить или выключить стиль. Включённые стили идут в порядке включения (новый — внизу и перекрывает прежние). */
export function toggleStyle(m: Mod, on: boolean) {
  // Свежие настройки, а не снимок при отрисовке: «Выключить все» вызывает toggle подряд, и каждый вызов должен видеть работу предыдущего.
  const s = getData().settings;
  const modsOn = on ? [...s.modsOn.filter((x) => x !== m.id), m.id] : s.modsOn.filter((x) => x !== m.id);
  if (m.font && on) void FONTS.find((f) => f.id === m.font)?.load?.();
  // Стиль из файла может менять оформление — запоминаем, как было, чтобы вернуть при выключении.
  if (m.look || m.accent) {
    const backup = { ...(s.styleBackup ?? {}) };
    if (on) {
      backup[m.id] = { look: s.look, accent: s.accent };
      return updateSettings({ modsOn, styleBackup: backup, look: { ...s.look, ...m.look }, ...(m.accent ? { accent: m.accent } : {}) });
    }
    const prev = backup[m.id];
    delete backup[m.id];
    return updateSettings({ modsOn, styleBackup: backup, ...(prev ? { look: prev.look, accent: prev.accent } : {}) });
  }
  updateSettings({ modsOn });
}

/** Поменять порядок включённого стиля: -1 — выше (раньше применяется), +1 — ниже (перекрывает). */
export function moveStyle(id: string, delta: -1 | 1) {
  const s = getData().settings;
  const i = s.modsOn.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= s.modsOn.length) return;
  const next = [...s.modsOn];
  [next[i], next[j]] = [next[j], next[i]];
  updateSettings({ modsOn: next });
}

export function setStyleValue(styleId: string, key: string, v: StyleValue | undefined) {
  const s = getData().settings;
  const cur = { ...(s.styleValues[styleId] ?? {}) };
  if (v === undefined) delete cur[key];
  else cur[key] = v;
  const styleValues = { ...s.styleValues };
  if (Object.keys(cur).length) styleValues[styleId] = cur;
  else delete styleValues[styleId];
  updateSettings({ styleValues });
}

