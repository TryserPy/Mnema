// Этап 2 плана 2.0 («вычитание»): Сад, Достижения, «Совет дня» и переключатели ядра убраны (моды-программы после этого вернули по просьбе автора). Старые файлы данных должны открываться как раньше.
import { describe, expect, it } from 'vitest';
import { FEATURES, MODS_AVAILABLE } from './featureList';
import { dropRemoved, emptyData, normalizeData } from './store';

const REMOVED = ['awards', 'garden', 'leeches', 'test', 'focus', 'tips', 'weekly'];

/** Данные, какими их сохраняла Мнема 1.8: с плагинами, достижениями и возможностями «Сад», «Достижения», «Моды». */
function oldFile() {
  const d = emptyData();
  const s = d.settings as unknown as Record<string, unknown>;
  s.plugins = [{ id: 'p1', name: 'Помодоро', version: '1.0', description: '', code: 'export default {}', enabled: true }];
  s.pluginsSafe = false;
  s.pluginData = { p1: { n: 3 } };
  s.awardsSeen = ['streak3', 'answers100'];
  Object.assign(s.features as object, { mods: true, awards: true, garden: true, leeches: true, test: true, focus: true, tips: true, weekly: true });
  s.tips = true;
  s.dismissedTips = ['g-mix'];
  d.settings.modsOn = ['notebook', 'm-1'];
  d.settings.customMods = [{ id: 'm-1', name: 'Мой', description: '', css: '.btn { color: red; }' }];
  d.settings.userCss = '.hero { opacity: .9; }';
  d.subjects = [{ id: 's', name: 'Физика', color: '#00f', createdAt: '2026-09-01T10:00:00.000Z' }];
  return JSON.parse(JSON.stringify(d));
}

describe('2.0, этап 2: старые данные', () => {
  it('файл с плагинами, достижениями и садом открывается', () => {
    const d = normalizeData(oldFile());
    expect(d.subjects.map((s) => s.name)).toEqual(['Физика']);
  });

  it('мёртвые поля выбрасываются: достижения, советы; возможности «Сад», «Достижения», «Совет дня» и пять переключателей ядра', () => {
    const d = normalizeData(oldFile());
    const s = d.settings as unknown as Record<string, unknown>;
    for (const k of ['awardsSeen', 'tips', 'dismissedTips']) expect(k in s).toBe(false);
    for (const k of REMOVED) expect(k in d.settings.features).toBe(false);
  });

  it('моды-программы, стили, свои стили и свой CSS остаются', () => {
    const d = normalizeData(oldFile());
    expect(d.settings.plugins).toHaveLength(1);
    expect(d.settings.pluginData).toEqual({ p1: { n: 3 } });
    expect(d.settings.features.mods).toBe(true);
    expect(d.settings.modsOn).toEqual(['notebook', 'm-1']);
    expect(d.settings.customMods).toHaveLength(1);
    expect(d.settings.userCss).toBe('.hero { opacity: .9; }');
  });

  it('остальные возможности не задеты', () => {
    const d = normalizeData(oldFile());
    expect(d.settings.features.homework).toBe(true);
    expect(d.settings.features.lists).toBe(true);
    expect(d.settings.features.map).toBe(false);
  });

  it('повторная очистка ничего не ломает', () => {
    const once = normalizeData(oldFile());
    const twice = dropRemoved(JSON.parse(JSON.stringify(once)));
    expect(twice.settings).toEqual(once.settings);
  });

  it('новые данные не содержат убранных возможностей', () => {
    const f = emptyData().settings.features as unknown as Record<string, unknown>;
    for (const k of REMOVED) expect(k in f).toBe(false);
  });

  it('в списке «Возможностей» их тоже нет', () => {
    const ids = FEATURES.map((f) => f.id as string);
    for (const k of REMOVED) expect(ids).not.toContain(k);
    expect(new Set(ids).size).toBe(ids.length);
    // 1.23.0: моды скрыты (MODS_AVAILABLE = false), код остался — вернуть можно одной строкой.
    expect(MODS_AVAILABLE).toBe(false);
    expect(ids).not.toContain('mods');
    expect(ids).toHaveLength(13);
  });
});
