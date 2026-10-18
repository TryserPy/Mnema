// 1.33, №12: ИИ-кредиты — веса операций в одной таблице, перевод прежних страниц без потерь, тексты счётчика.
import { describe, expect, it } from 'vitest';
import { CREDITS_PER_PAGE, creditsMicro, creditsWord, KIND_TITLE, pagesToCredits, TASK_CREDITS, TASK_KIND } from '../shared/refrain/credits';
import { PAGE_MICRO, TASK_SPECS } from '../shared/prompts/tasks';
import { DEFAULT_GROUPS } from '../shared/refrain/policy';
import { quotaLines } from './refrain';
import type { Quota } from '../shared/refrain/api.mjs';

describe('веса операций', () => {
  it('у каждой задачи Refrain ИИ есть вес и вид («на что потрачено»)', () => {
    for (const id of Object.keys(TASK_SPECS)) {
      expect(TASK_CREDITS[id as keyof typeof TASK_CREDITS], id).toBeGreaterThan(0);
      expect(KIND_TITLE[TASK_KIND[id as keyof typeof TASK_KIND]], id).toBeTruthy();
    }
  });
  it('скан страницы — ровно прежняя «страница»; «Объясни иначе» дешевле карточек, карточки дешевле скана', () => {
    expect(creditsMicro('textbook.summary', PAGE_MICRO)).toBe(PAGE_MICRO);
    expect(TASK_CREDITS.explain).toBeLessThan(TASK_CREDITS.cards);
    expect(TASK_CREDITS.cards).toBeLessThan(TASK_CREDITS['textbook.summary']);
  });
});

describe('перевод прежних страниц', () => {
  it('планы групп и счётчики — × 10 без округления до нуля', () => {
    const student = DEFAULT_GROUPS.find((g) => g.id === 'student')!;
    expect(pagesToCredits(student.perDay!)).toBe(300);
    expect(pagesToCredits(student.perMonth!)).toBe(4000);
    expect(pagesToCredits(0.05)).toBe(0.5);
    expect(CREDITS_PER_PAGE).toBe(10);
  });
});

describe('счётчик для ученика', () => {
  const q: Quota = {
    day: { used: 5, limit: 30 },
    month: { used: 50, limit: 400 },
    resetsAt: '2026-10-18T21:00:00.000Z',
    group: 'student',
    credits: { day: { used: 47, limit: 300 }, month: { used: 497, limit: 4000 } }
  };
  it('кредиты из ответа сервера, остаток и когда обновится', () => {
    const l = quotaLines(q, Date.parse('2026-10-18T12:00:00.000Z'));
    expect(l.day).toBe('Сегодня 47 из 300 кредитов');
    expect(l.left).toBe(253);
    expect(l.resets).toBe('обновятся в 00:00 по Москве');
  });
  it('месяц исчерпан — «обновятся 1-го числа»', () => {
    const l = quotaLines({ ...q, credits: { day: { used: 10, limit: 300 }, month: { used: 4000, limit: 4000 } } }, Date.parse('2026-10-18T12:00:00.000Z'));
    expect(l.left).toBe(0);
    expect(l.resets).toBe('обновятся 1-го числа');
  });
  it('склонение', () => {
    expect([1, 2, 5, 11, 21, 22, 0.5].map((n) => `${n} ${creditsWord(n)}`)).toEqual(['1 кредит', '2 кредита', '5 кредитов', '11 кредитов', '21 кредит', '22 кредита', '0.5 кредита']);
  });
});
