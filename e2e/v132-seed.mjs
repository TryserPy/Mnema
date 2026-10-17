// Данные для проверок 1.32: «Геометрия» с вложенными темами и длинными названиями, «Биология».
const T0 = '2026-09-01T10:00:00.000Z';
const topic = (id, subjectId, name, extra = {}) => ({ id, subjectId, name, note: `# ${name}\n\nТекст конспекта про «${name}». Формула $a^2+b^2=c^2$.`, createdAt: T0, updatedAt: T0, ...extra });
export function seed() {
  const topics = [
    topic('g1', 'geo', 'Четырёхугольники', { order: 1 }),
    topic('g2', 'geo', 'Параллелограмм', { parentId: 'g1', order: 1 }),
    topic('g3', 'geo', 'Прямоугольник, ромб и квадрат: свойства, признаки и задачи на доказательство', { parentId: 'g1', order: 2 }),
    topic('g4', 'geo', 'Трапеция и средняя линия трапеции', { parentId: 'g1', order: 3 }),
    topic('g5', 'geo', 'Теорема Фалеса', { parentId: 'g4', order: 1 }),
    topic('g6', 'geo', 'Площади многоугольников', { order: 2 }),
    topic('b1', 'bio', '§1. Зоология — наука о животных', { order: 1 }),
    topic('b2', 'bio', '§2. Простейшие: амёба, эвглена, инфузория-туфелька', { order: 2 })
  ];
  const cards = [];
  let n = 0;
  for (const t of topics) for (let i = 0; i < (t.id === 'g1' ? 4 : 3); i++) cards.push({ id: 'c' + ++n, topicId: t.id, type: 'basic', front: `Вопрос ${n} по теме «${t.name}»?`, back: `Ответ ${n}`, createdAt: T0, updatedAt: T0 });
  return {
    version: 1,
    subjects: [
      { id: 'geo', name: 'Геометрия', color: '#3366CC', icon: '📐', createdAt: T0, order: 1 },
      { id: 'bio', name: 'Биология', color: '#2BA36B', icon: '🧬', createdAt: T0, order: 2 }
    ],
    topics,
    cards,
    states: {},
    logs: [],
    tests: [],
    settings: { onboarded: true, theme: 'light', features: { ai: true } }
  };
}

