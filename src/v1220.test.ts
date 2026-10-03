// 1.22.0: закрытые подсказки запоминаются и переживают разбор данных; новые виды анимаций не теряются.
import { describe, expect, it } from 'vitest';
import { emptyData, getData, normalizeData, replaceData, updateSettings } from './store';
import { hideTip } from './components/Dismissible';

describe('закрытые подсказки', () => {
  it('запоминаются и не дублируются', () => {
    replaceData(emptyData());
    hideTip('textbook', getData().settings.hiddenTips);
    hideTip('textbook', getData().settings.hiddenTips);
    hideTip('noteSet', getData().settings.hiddenTips);
    expect(getData().settings.hiddenTips).toEqual(['textbook', 'noteSet']);
  });
  it('переживают normalizeData (старые данные без поля тоже открываются)', () => {
    const d = emptyData();
    d.settings = { ...d.settings, hiddenTips: ['textbook'] };
    expect(normalizeData(JSON.parse(JSON.stringify(d))).settings.hiddenTips).toEqual(['textbook']);
    const old = JSON.parse(JSON.stringify(emptyData()));
    delete old.settings.hiddenTips;
    expect(normalizeData(old).settings.hiddenTips ?? []).toEqual([]);
  });
  it('«Показать снова» очищает список', () => {
    replaceData(emptyData());
    hideTip('textbook', undefined);
    updateSettings({ hiddenTips: [] });
    expect(getData().settings.hiddenTips).toEqual([]);
  });
});

describe('анимации', () => {
  it('новые виды можно выключать выборочно', () => {
    replaceData(emptyData());
    updateSettings({ motion: 'custom', motionOff: ['lists', 'press', 'guide'] });
    expect(normalizeData(JSON.parse(JSON.stringify(getData()))).settings.motionOff).toEqual(['lists', 'press', 'guide']);
  });
});
