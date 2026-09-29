// Примеры формул для справки. Тот же список описан в docs/formulas.md.
export interface FormulaExample {
  name: string;
  tex: string;
}

export const FORMULA_GROUPS: { title: string; items: FormulaExample[] }[] = [
  {
    title: 'Математика',
    items: [
      { name: 'Дробь', tex: '\\frac{a}{b}' },
      { name: 'Степень', tex: 'x^2 + x^{10}' },
      { name: 'Корень', tex: '\\sqrt{x}, \\quad \\sqrt[3]{27} = 3' },
      { name: 'Нижний индекс', tex: 'a_1, \\; a_{n+1}' },
      { name: 'Умножение', tex: 'a \\cdot b' },
      { name: 'Сравнения', tex: 'a \\ne b, \\; a \\le b, \\; a \\ge b' },
      { name: 'Модуль', tex: '|x - 3|' },
      { name: 'Плюс-минус', tex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
      { name: 'Система уравнений', tex: '\\begin{cases} x + y = 5 \\\\ x - y = 1 \\end{cases}' },
      { name: 'Градусы и π', tex: '180^\\circ = \\pi' },
      { name: 'Синус, логарифм', tex: '\\sin \\alpha, \\; \\log_2 8 = 3' }
    ]
  },
  {
    title: 'Физика',
    items: [
      { name: 'Закон Ома', tex: 'I = \\frac{U}{R}' },
      { name: 'Вектор', tex: '\\vec{F} = m\\vec{a}' },
      { name: 'Изменение величины', tex: 'v = \\frac{\\Delta s}{\\Delta t}' },
      { name: 'Единицы измерения', tex: 'v = 20\\ \\text{м/с}' },
      { name: 'Греческие буквы', tex: '\\rho, \\lambda, \\omega, \\eta' }
    ]
  },
  {
    title: 'Химия',
    items: [
      { name: 'Уравнение реакции', tex: '2H_2 + O_2 \\rightarrow 2H_2O' },
      { name: 'Ион', tex: 'SO_4^{2-}' },
      { name: 'Обратимая реакция', tex: 'N_2 + 3H_2 \\rightleftharpoons 2NH_3' }
    ]
  }
];
