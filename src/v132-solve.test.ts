// 1.32, N3: пошаговое решение — разделы ответа, карточка из решения, запрос (фото уменьшено, задача solve).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanSolution, solutionCard, solutionParts } from './solve';

afterEach(() => vi.unstubAllGlobals());

const MD = ['```markdown', '### Условие', 'Дано: $s = 120$ км, $t = 1{,}5$ ч. Найти: $v$.', '### Решение', '1. Скорость — путь, делённый на время: $v = \\frac{s}{t}$.', '2. $v = \\frac{120}{1{,}5} = 80$ км/ч.', '### Ответ', '80 км/ч', '### Проверка', '$80 \\cdot 1{,}5 = 120$ ✓', '```'].join('\n');

describe('решение по шагам', () => {
  it('без обёртки ``` и по разделам', () => {
    const md = cleanSolution(MD);
    expect(md.startsWith('### Условие')).toBe(true);
    const p = solutionParts(md);
    expect(p.condition).toContain('Найти: $v$');
    expect(p.steps.split('\n')).toHaveLength(2);
    expect(p.answer).toBe('80 км/ч');
    expect(p.check).toContain('120');
  });
  it('ответ без разделов — всё в шаги', () => {
    expect(solutionParts('Сначала найдём время. Ответ: 5 с.').steps).toBe('Сначала найдём время. Ответ: 5 с.');
  });
  it('карточка: условие → ответ, шаги — в «почему»; без условия — текст ученика', () => {
    expect(solutionCard(cleanSolution(MD), '')).toMatchObject({ front: expect.stringContaining('Дано'), back: '80 км/ч', why: expect.stringContaining('\\frac{s}{t}') });
    expect(solutionCard('### Ответ\n42', 'Сколько?')).toEqual({ front: 'Сколько?', back: '42' });
  });
  it('запрос: Refrain ИИ — задача solve с текстом; свой ключ — шаблон «Решение задачи»', async () => {
    let sent: Record<string, any> = {};
    vi.stubGlobal('window', { mnemaApi: { aiAsk: async (r: Record<string, any>) => ((sent = r), { ok: true, text: MD }) } });
    const { solveProblem } = await import('./solve');
    const md = await solveProblem({ text: 'Автомобиль проехал 120 км за 1,5 ч.', subject: 'Физика' });
    expect(md).toContain('### Ответ');
    expect(sent.refrain).toMatchObject({ task: 'solve', text: 'Автомобиль проехал 120 км за 1,5 ч.', subject: 'Физика' });
    expect(sent.system).toContain('ПОШАГОВО');
    expect(sent.system).toContain('### Условие');
    await expect(solveProblem({})).rejects.toThrow(/Сфотографируй/);
  });
});
