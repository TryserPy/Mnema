// Действия над стилями (включить, порядок, значения настроек): отдельно от интерфейса, чтобы их можно было проверять тестами.
import { cleanBg } from './bgImage';
import { getData, updateSettings } from './store';
import { FONTS } from './themes';
import type { BgImage, Mod, Settings, StyleValue } from './types';

/** Фон от стиля поверх того, что есть: картинка из стиля заменяет свою, а числа (положение, видимость…) подстраиваются под картинку, которая уже стоит. */
export function bgWithStyle(cur: BgImage | undefined, bg: Partial<BgImage>): BgImage | undefined {
  const src = bg.src ?? cur?.src;
  if (!src) return cur; // у стиля только настройки, а картинки нет нигде — ничего не меняем
  return cleanBg({ ...(cur ?? {}), ...bg, v: 2, src }) ?? cur;
}

/** Включить или выключить стиль. Включённые стили идут в порядке включения (новый — внизу и перекрывает прежние). */
export function toggleStyle(m: Mod, on: boolean) {
  // Свежие настройки, а не снимок при отрисовке: «Выключить все» вызывает toggle подряд, и каждый вызов должен видеть работу предыдущего.
  const s = getData().settings;
  const modsOn = on ? [...s.modsOn.filter((x) => x !== m.id), m.id] : s.modsOn.filter((x) => x !== m.id);
  if (m.font && on) void FONTS.find((f) => f.id === m.font)?.load?.();
  // Стиль может менять и основу оформления (тема, цвета, плотность, размер текста, фон) — запоминаем, как было, чтобы вернуть при выключении.
  if (m.look || m.accent || m.density || m.fontScale || m.bg) {
    const backup = { ...(s.styleBackup ?? {}) };
    if (on) {
      backup[m.id] = { look: s.look, accent: s.accent, ...(m.density ? { density: s.density } : {}), ...(m.fontScale ? { fontScale: s.fontScale } : {}), ...(m.bg ? { bgImage: s.bgImage ?? null } : {}) };
      return updateSettings({
        modsOn,
        styleBackup: backup,
        look: { ...s.look, ...m.look },
        ...(m.accent ? { accent: m.accent } : {}),
        ...(m.density ? { density: m.density } : {}),
        ...(m.fontScale ? { fontScale: m.fontScale } : {}),
        ...(m.bg ? { bgImage: bgWithStyle(s.bgImage, m.bg) } : {})
      });
    }
    const prev = backup[m.id];
    delete backup[m.id];
    return updateSettings({
      modsOn,
      styleBackup: backup,
      ...(prev ? { look: prev.look, accent: prev.accent } : {}),
      ...(prev?.density ? { density: prev.density } : {}),
      ...(prev?.fontScale ? { fontScale: prev.fontScale } : {}),
      ...(prev && prev.bgImage !== undefined ? { bgImage: prev.bgImage ?? undefined } : {})
    });
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


// ---------- Предпросмотр основы оформления ----------
// Стиль может менять тему, цвета, плотность, размер текста и фон — это лежит в настройках, а не в CSS стиля. Чтобы показать такой стиль
// на настоящем интерфейсе ДО сохранения, мы временно кладём его основу в настройки и запоминаем, что там было; «null» всё возвращает.

type BaseSnap = Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage'>;
let baseSnap: BaseSnap | null = null;

/** Показать основу стиля (или null — вернуть как было). Вызывать до настоящего сохранения: сначала null, потом toggleStyle. */
export function setBasePreview(m: Mod | null) {
  if (!m) {
    if (baseSnap) {
      const snap = baseSnap;
      baseSnap = null;
      updateSettings({ ...snap });
    }
    return;
  }
  const s = getData().settings;
  baseSnap ??= { look: s.look, accent: s.accent, density: s.density, fontScale: s.fontScale, bgImage: s.bgImage };
  const b = baseSnap;
  updateSettings({
    look: { ...b.look, ...m.look },
    accent: m.accent ?? b.accent,
    density: m.density ?? b.density,
    fontScale: m.fontScale ?? b.fontScale,
    bgImage: m.bg ? bgWithStyle(b.bgImage, m.bg) : b.bgImage
  });
}

/** Сохранить стиль в «Мои стили». Если он включён — выключается и включается заново уже новым, чтобы его основа (тема, плотность, фон…) применилась. */
export function saveCustomStyle(m: Mod, opts: { enable?: boolean } = {}) {
  setBasePreview(null);
  const s0 = getData().settings;
  const old = s0.customMods.find((x) => x.id === m.id);
  const wasOn = s0.modsOn.includes(m.id);
  if (old && wasOn) toggleStyle(old, false);
  const s1 = getData().settings;
  const customMods = old ? s1.customMods.map((x) => (x.id === m.id ? m : x)) : [...s1.customMods, m];
  updateSettings({ customMods });
  if (wasOn || opts.enable) toggleStyle(m, true);
}
