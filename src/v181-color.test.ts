import { describe, expect, it } from 'vitest';
import { accentText, contrast, onAccent, parseHex } from './color';
import { THEMES } from './themes';

const rgb = (h: string) => parseHex(h)!;

describe('2.0: контраст темы и акцента', () => {
  it('контраст: чёрное на белом — 21, одинаковые цвета — 1', () => {
    expect(Math.round(contrast(rgb('#000'), rgb('#fff')))).toBe(21);
    expect(contrast(rgb('#336699'), rgb('#336699'))).toBeCloseTo(1, 5);
  });

  it('светлые акценты тёмных тем («Лес», «Кофе», «Слива»…) получают тёмный текст ≥ 4,5:1, а не белый 2,2:1', () => {
    for (const t of THEMES.filter((x) => x.dark)) {
      const on = onAccent(t.accent);
      expect(contrast(rgb(t.accent), rgb(on)), `${t.name}: ${t.accent} → ${on}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('тёмные акценты по-прежнему получают белый текст (светлые темы не меняются)', () => {
    for (const t of THEMES.filter((x) => !x.dark)) {
      expect(onAccent(t.accent), t.name).toBe('#FFFFFF');
      expect(contrast(rgb(t.accent), rgb('#fff'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('любой акцент из выбора как текст на любой теме читается (≥ 4,5:1); невидимый #3A3F4E на тёмной теме подтягивается', () => {
    const accents = ['#4C5BD4', '#3F51D8', '#1F7A6B', '#C2417A', '#A4591A', '#3A3F4E', '#6B3FC4', '#2A5BB8', '#0E8FA3', '#2F8F5B', '#E0A15B'];
    for (const t of THEMES) {
      for (const a of accents) {
        const txt = accentText(a, t.p.surface);
        expect(contrast(rgb(txt), rgb(t.p.surface)), `${t.name} ${a} → ${txt}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(accentText('#3A3F4E', '#20232D')).not.toBe('#3A3F4E');
  });

  it('если акцент уже читается — не трогаем', () => {
    expect(accentText('#4C5BD4', '#FFFFFF')).toBe('#4C5BD4');
  });

  it('мусор на входе не ломает', () => {
    expect(onAccent('red')).toBe('#FFFFFF');
    expect(accentText('red', '#fff')).toBe('red');
  });
});
