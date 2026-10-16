// Действия над оформлением (выбрать стиль, дополнения, порядок, значения настроек, правки): отдельно от интерфейса, чтобы их можно было проверять тестами.
// 1.31: каждое действие меняет settings.appearance и сразу пишет его проекцию в прежние поля (look, accent, modsOn, myStyle…) — по ним рисует окно
// и работает 1.30 после отката (styleMigrate.ts). toggleStyle и прочие действия 1.30 остались для совместимости.
import { currentAsMod } from './appearance';
import { cleanBg } from './bgImage';
import { allMods } from './mods';
import { getData, updateSettings } from './store';
import type { Appearance, Mod131 } from './styleModel';
import { appearanceOf, classifyRole, EDITS_ID, isBaseStyle, migrateAppearance, projectAppearance } from './styleMigrate';
import { newStyleId } from './styleSystem';
import { FONTS, PALETTE_VARS } from './themes';
import type { BgImage, Mod, Settings, StyleValue } from './types';

// ---------- 1.31: стиль + дополнения + мои правки ----------

/** Поменять оформление и записать его проекцию. `customMods` — если вместе с оформлением меняется список своих стилей. */
export function setAppearance(patch: Partial<Appearance>, customMods?: Mod[]) {
  const s = getData().settings;
  const mods = customMods ?? s.customMods;
  const a: Appearance = { ...appearanceOf({ ...s, customMods: mods }), ...patch };
  if (!a.edits) delete a.edits;
  for (const m of [a.style, ...a.addons]) if (m) void FONTS.find((f) => f.id === allMods(mods).find((x) => x.id === m)?.font)?.load?.();
  updateSettings({ ...(customMods ? { customMods } : {}), ...projectAppearance(a, mods), appearance: a });
}

/** Запомнить открытую вкладку «Оформления» (вид окна не меняется). */
export function setAppearanceTab(tab: NonNullable<Appearance['tab']>) {
  const s = getData().settings;
  updateSettings({ appearance: { ...appearanceOf(s), tab } });
}

/** Правки, которые относятся к цветам стиля: при смене стиля они сбрасываются, иначе новый стиль выглядел бы как прежний. */
const COLOR_VARS = new Set([...Object.values(PALETTE_VARS), '--accent']);
export function editsForNewStyle(e: Mod131 | undefined): Mod131 | undefined {
  if (!e) return undefined;
  const { accent: _a, look, vars, ...rest } = e;
  const out: Mod131 = { ...rest };
  if (look) {
    const { light: _l, dark: _d, style: _s, headFont: _h, ...keep } = look;
    if (Object.keys(keep).length) out.look = keep;
  }
  const v = { light: { ...(vars?.light ?? {}) }, dark: { ...(vars?.dark ?? {}) } };
  for (const mode of ['light', 'dark'] as const) for (const k of Object.keys(v[mode])) if (COLOR_VARS.has(k)) delete v[mode][k];
  if (Object.keys(v.light).length || Object.keys(v.dark).length) out.vars = { ...(Object.keys(v.light).length ? { light: v.light } : {}), ...(Object.keys(v.dark).length ? { dark: v.dark } : {}) };
  return Object.keys(out).length > 3 ? out : undefined;
}

/** Выбрать стиль (ровно один). Правки цветов от прежнего стиля сбрасываются, остальные правки остаются. */
export function pickStyle(id: string) {
  const a = appearanceOf(getData().settings);
  if (a.style === id) return;
  setAppearance({ style: id, addons: a.addons.filter((x) => x !== id), edits: editsForNewStyle(a.edits) });
}

/** Включить или выключить дополнение. Новое — в конце: применяется последним и перекрывает прежние. */
export function toggleAddon(id: string, on: boolean) {
  const a = appearanceOf(getData().settings);
  const rest = a.addons.filter((x) => x !== id);
  setAppearance({ addons: on ? [...rest, id] : rest });
}

/** Поменять порядок дополнения: -1 — раньше, +1 — позже (перекрывает). */
export function moveAddon(id: string, delta: -1 | 1) {
  const list = [...appearanceOf(getData().settings).addons];
  const i = list.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  setAppearance({ addons: list });
}

/** «Сбросить правки»: оформление становится таким, как задумал автор стиля. */
export function resetEdits() {
  setAppearance({ edits: undefined });
}

/** Правка прежних полей (быстрые настройки, редактор «Настроить»): оформление пересчитывается — разница со стилем и есть «мои правки». */
export function setCurrent(patch: Partial<Pick<Settings, 'look' | 'accent' | 'density' | 'fontScale' | 'bgImage' | 'myStyle'>>) {
  const s = getData().settings;
  const next = { ...s, ...patch };
  updateSettings({ ...patch, appearance: migrateAppearance({ ...next, appearance: s.appearance }) });
}

/** Стиль целиком, как он сейчас выглядит: основа стиля + его CSS и переменные + мои правки. Для «Сохранить как стиль». */
export function currentAsStyle(name: string): Mod131 {
  const s = getData().settings;
  const a = appearanceOf(s);
  const style = isBaseStyle(a.style) ? undefined : allMods(s.customMods).find((m) => m.id === a.style);
  const cur = currentAsMod(s);
  const merge = (mode: 'light' | 'dark') => ({ ...(style?.vars?.[mode] ?? {}), ...(cur.vars?.[mode] ?? {}) });
  const light = merge('light');
  const dark = merge('dark');
  const css = [style?.css ?? '', cur.css ?? ''].filter((x) => x.trim()).join('\n\n');
  const out: Mod131 = {
    ...cur,
    id: newStyleId(),
    name: name.trim().slice(0, 50) || 'Мой стиль',
    description: style ? `На основе «${style.name}»` : 'Оформление из Refrain',
    icon: style?.icon ?? '🎨',
    where: 'свой',
    role: 'style',
    origin: 'mine',
    ...(Object.keys(light).length || Object.keys(dark).length ? { vars: { ...(Object.keys(light).length ? { light } : {}), ...(Object.keys(dark).length ? { dark } : {}) } } : {}),
    ...(style?.attrs || cur.attrs ? { attrs: { ...(style?.attrs ?? {}), ...(cur.attrs ?? {}) } } : {}),
    ...(css ? { css } : {}),
    ...(style?.settings ? { settings: style.settings } : {}),
    ...(style?.fonts ? { fonts: style.fonts } : {}),
    ...(style?.font && !cur.font ? { font: style.font } : {})
  };
  return out;
}

/** «Сохранить как стиль»: мои правки вместе со стилем становятся своим стилем, он выбирается, правок больше нет. */
export function saveEditsAsStyle(name: string): Mod131 {
  const s = getData().settings;
  const m = currentAsStyle(name);
  const a = appearanceOf(s);
  const values = a.values[a.style] ? { ...a.values, [m.id]: { ...a.values[a.style] } } : a.values;
  setAppearance({ style: m.id, edits: undefined, values, addons: a.addons }, [...s.customMods, m]);
  return m;
}

/** Сохранить свой стиль или дополнение (из редактора, ИИ или файла). enable — сразу поставить: стиль выбирается, дополнение включается. */
export function saveStyle(m: Mod131, opts: { enable?: boolean } = {}) {
  setBasePreview(null);
  const s = getData().settings;
  const customMods = s.customMods.some((x) => x.id === m.id) ? s.customMods.map((x) => (x.id === m.id ? m : x)) : [...s.customMods, m];
  const a = appearanceOf(s);
  if (!opts.enable) return setAppearance({}, customMods);
  if (classifyRole(m) === 'style') setAppearance({ style: m.id, addons: a.addons.filter((x) => x !== m.id), ...(a.style !== m.id ? { edits: editsForNewStyle(a.edits) } : {}) }, customMods);
  else setAppearance({ addons: a.addons.includes(m.id) ? a.addons : [...a.addons, m.id] }, customMods);
}

/** Удалить свой стиль или дополнение. Если это был выбранный стиль — ставится «Современный». */
export function removeStyle(id: string) {
  const s = getData().settings;
  const a = appearanceOf(s);
  const values = { ...a.values };
  delete values[id];
  setAppearance({ ...(a.style === id ? { style: 'modern', edits: editsForNewStyle(a.edits) } : {}), addons: a.addons.filter((x) => x !== id), values }, s.customMods.filter((x) => x.id !== id));
}

/** Значение настройки стиля или дополнения. */
export function setAppearanceValue(styleId: string, key: string, v: StyleValue | undefined) {
  const a = appearanceOf(getData().settings);
  const cur = { ...(a.values[styleId] ?? {}) };
  if (v === undefined) delete cur[key];
  else cur[key] = v;
  const values = { ...a.values };
  if (Object.keys(cur).length) values[styleId] = cur;
  else delete values[styleId];
  setAppearance({ values });
}

export { EDITS_ID };

// ---------- 1.30 ----------

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
