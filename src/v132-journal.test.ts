// 1.32: журнал без повторов (×N), подсказки страниц одной строкой, консоль разработчика без секретов.
import { describe, expect, it } from 'vitest';
import { clearLog, journalLines, logEntries, logLine, scrubLine } from './refrain';
import { maskUrl, tapVersion } from './devMode';
import { groupByText } from './components/TextbookImport';

describe('журнал', () => {
  it('одинаковые записи подряд — одна со счётчиком и временем последней', () => {
    clearLog();
    const t = Date.parse('2026-10-17T15:31:55');
    logLine('ИИ (textbook.verbatim): Нет ключа ИИ.', 'error', t);
    logLine('ИИ (textbook.verbatim): Нет ключа ИИ.', 'error', t + 5000);
    logLine('другое', 'error', t + 6000);
    logLine('ИИ (textbook.verbatim): Нет ключа ИИ.', 'error', t + 7000);
    expect(logEntries().map((e) => e.n)).toEqual([2, 1, 1]);
    expect(journalLines()[0]).toMatch(/^15:31:55 .* ×2 \(последний раз 15:32:00\)$/);
  });

  it('ключи и токены в журнал не попадают', () => {
    expect(scrubLine('ошибка Bearer abc.def и sk-or-v1-0123456789abcdef и AIzaSyA0123456789abcd')).not.toMatch(/abc\.def|sk-or|AIza/);
    expect(scrubLine('почта u@example.com')).toBe('почта [почта]');
  });

  it('одинаковые подсказки к страницам — одной строкой', () => {
    const g = groupByText([
      { n: 1, text: 'Буквы мелкие' },
      { n: 2, text: 'Буквы мелкие' },
      { n: 4, text: 'Размыто' },
      { n: 5, text: 'Буквы мелкие' }
    ]);
    expect(g).toEqual([
      { text: 'Буквы мелкие', pages: [1, 2, 5] },
      { text: 'Размыто', pages: [4] }
    ]);
  });
});

describe('консоль разработчика', () => {
  it('адреса без ключей, токенов, паролей и почты', () => {
    expect(maskUrl('https://x.ru/v1/models?key=AIza123&x=1')).toBe('https://x.ru/v1/models?key=•••&x=1');
    expect(maskUrl('https://oauth.yandex.ru/verification_code#access_token=y0_abc&state=1')).toBe('https://oauth.yandex.ru/verification_code#access_token=•••&state=1');
    expect(maskUrl('https://user:pass@dav.example.com/a')).toBe('https://•••@dav.example.com/a');
    expect(maskUrl('https://x.ru/u/anna@example.com')).not.toContain('anna');
  });

  it('7 быстрых нажатий на версию включают режим; медленные — нет', () => {
    let t = 1_000_000;
    for (let i = 0; i < 6; i++) expect(tapVersion((t += 3000))).toBeLessThan(7);
    t += 5000; // пауза — счёт заново
    let last = 0;
    for (let i = 0; i < 7; i++) last = tapVersion((t += 300));
    expect(last).toBe(7);
  });
});
