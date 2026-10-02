// Готовые моды с кодом — примеры того, что можно сделать. Их код можно открыть и поменять.
export const TEMPLATE = `// @id my-mod
// @icon 🧩
// @name Мой мод
// @version 1.0
// @author Я
// @description Что делает мод

export default {
  onload(app) {
    // Команда — появится в поиске Ctrl+P
    app.commands.add({
      id: 'hello',
      name: 'Поздороваться',
      run: () => app.ui.toast('Привет из мода!')
    });

    // Кнопка в левой панели и свой экран
    app.ui.addView({
      id: 'main',
      title: 'Мой экран',
      icon: '🧩',
      render(el) {
        const topics = app.data.topics();
        el.innerHTML = '<h1 class="display">Мой экран</h1><p>Тем: ' + topics.length + '</p>';
      }
    });

    // Событие: ответ на карточку
    app.events.on('review', (e) => {
      if (e.rating === 4) console.log('Легко!', e.cardId);
    });
  },
  onunload() {
    // тут убрать за собой, если нужно (таймеры и т. п.)
  }
};
`;

export const CATALOG_PLUGINS: { id: string; name: string; description: string; code: string }[] = [
  {
    id: 'pomodoro',
    name: 'Помодоро',
    description: 'Таймер «25 минут учёбы — 5 минут отдыха» со своим экраном и кнопкой в левой панели.',
    code: `// @id pomodoro
// @icon 🍅
// @name Помодоро
// @version 1.0
// @author Мнема
// @description Таймер 25/5 со своим экраном

let timer = null;
let left = 25 * 60;
let phase = 'work';
let listeners = new Set();
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

export default {
  onload(app) {
    const tick = () => {
      left--;
      if (left <= 0) {
        phase = phase === 'work' ? 'rest' : 'work';
        left = (phase === 'work' ? 25 : 5) * 60;
        app.ui.toast(phase === 'work' ? '⏰ Перерыв окончен — за дело!' : '☕ 25 минут прошли — отдохни 5 минут');
      }
      listeners.forEach((f) => f());
    };
    const start = () => { if (!timer) timer = setInterval(tick, 1000); listeners.forEach((f) => f()); };
    const stop = () => { clearInterval(timer); timer = null; listeners.forEach((f) => f()); };
    app.commands.add({ id: 'start', name: 'Помодоро: начать', run: () => { start(); app.ui.openView('main'); } });
    app.commands.add({ id: 'stop', name: 'Помодоро: пауза', run: stop });
    app.ui.addView({
      id: 'main',
      title: 'Помодоро',
      icon: '🍅',
      render(el) {
        el.innerHTML = '<div class="page narrow" style="align-items:center;text-align:center"><h1 class="display">Помодоро</h1><div class="pomo-phase muted"></div><div class="pomo-time" style="font-size:5rem;font-weight:600;font-variant-numeric:tabular-nums"></div><div class="row gap8" style="justify-content:center"><button class="btn primary big-ish pomo-go"></button><button class="btn pomo-reset">Сначала</button></div><p class="small muted">25 минут учёбы, потом 5 минут отдыха. Так проще не отвлекаться.</p></div>';
        const draw = () => {
          el.querySelector('.pomo-time').textContent = fmt(left);
          el.querySelector('.pomo-phase').textContent = phase === 'work' ? 'Учёба' : 'Отдых';
          el.querySelector('.pomo-go').textContent = timer ? 'Пауза' : 'Старт';
        };
        el.querySelector('.pomo-go').onclick = () => (timer ? stop() : start());
        el.querySelector('.pomo-reset').onclick = () => { stop(); phase = 'work'; left = 25 * 60; draw(); };
        listeners.add(draw);
        draw();
        return () => listeners.delete(draw);
      }
    });
  },
  onunload() {
    clearInterval(timer);
    timer = null;
    listeners = new Set();
  }
};
`
  },
  {
    id: 'confetti',
    name: 'Конфетти',
    description: 'Каждые 10 правильных ответов подряд — салют из конфетти.',
    code: `// @id confetti
// @icon 🎉
// @name Конфетти
// @version 1.0
// @author Мнема
// @description Салют за 10 верных ответов подряд

let streak = 0;
function burst() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
  const colors = ['#F94144', '#F8961E', '#F9C74F', '#90BE6D', '#43AA8B', '#577590', '#B5179E'];
  for (let i = 0; i < 120; i++) {
    const p = document.createElement('i');
    const x = Math.random() * 100;
    const d = 1.6 + Math.random() * 1.4;
    p.style.cssText = 'position:absolute;top:-12px;left:' + x + 'vw;width:8px;height:14px;border-radius:2px;background:' + colors[i % colors.length] + ';transform:rotate(' + Math.random() * 360 + 'deg);transition:transform ' + d + 's cubic-bezier(.2,.6,.4,1), top ' + d + 's cubic-bezier(.2,.6,.4,1), opacity ' + d + 's';
    box.appendChild(p);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      p.style.top = (80 + Math.random() * 25) + 'vh';
      p.style.transform = 'translateX(' + (Math.random() * 200 - 100) + 'px) rotate(' + Math.random() * 720 + 'deg)';
      p.style.opacity = '0';
    }));
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

export default {
  onload(app) {
    app.events.on('review', (e) => {
      streak = e.rating > 1 ? streak + 1 : 0;
      if (streak > 0 && streak % 10 === 0) {
        burst();
        app.ui.toast('🎉 ' + streak + ' верных подряд!');
      }
    });
    app.commands.add({ id: 'test', name: 'Конфетти: показать', run: burst });
  }
};
`
  },
  {
    id: 'formula-sheet',
    name: 'Шпаргалка формул',
    description: 'Свой экран: все формулы из конспектов, по предметам и темам. Удобно перед контрольной.',
    code: `// @id formula-sheet
// @icon ∑
// @name Шпаргалка формул
// @version 1.0
// @author Мнема
// @description Все формулы из конспектов на одном экране

export default {
  onload(app) {
    app.ui.addView({
      id: 'main',
      title: 'Формулы',
      icon: '∑',
      render(el) {
        const d = app.data.get();
        let md = '# Шпаргалка формул\\n\\n';
        let count = 0;
        for (const s of d.subjects) {
          const parts = [];
          for (const t of d.topics.filter((x) => x.subjectId === s.id)) {
            const f = [...t.note.matchAll(/\\$\\$([^$]+)\\$\\$|\\$([^$\\n]+)\\$/g)].map((m) => (m[1] || m[2]).trim());
            const uniq = [...new Set(f)];
            if (uniq.length) {
              parts.push('**' + t.name + '**\\n\\n' + uniq.map((x) => '- $' + x + '$').join('\\n'));
              count += uniq.length;
            }
          }
          if (parts.length) md += '## ' + s.name + '\\n\\n' + parts.join('\\n\\n') + '\\n\\n';
        }
        if (!count) md += 'Пока нет формул. Пиши их в конспекте между знаками доллара: $E = mc^2$.';
        const box = document.createElement('div');
        box.className = 'page narrow';
        el.appendChild(box);
        app.ui.renderMarkdown(box, md);
      }
    });
    app.commands.add({ id: 'open', name: 'Открыть шпаргалку формул', run: () => app.ui.openView('main') });
  }
};
`
  },
  {
    id: 'word-count',
    name: 'Размер конспекта',
    description: 'В меню темы: сколько слов в конспекте и сколько минут его читать.',
    code: `// @id word-count
// @icon 📏
// @name Размер конспекта
// @version 1.0
// @author Мнема
// @description Слова и время чтения конспекта

export default {
  onload(app) {
    app.ui.addTopicAction({
      id: 'count',
      title: 'Сколько слов в конспекте',
      run(topic) {
        const words = topic.note.replace(/\\$[^$]*\\$/g, ' ').split(/\\s+/).filter((w) => /[\\p{L}\\d]/u.test(w)).length;
        const min = Math.max(1, Math.round(words / 150));
        app.ui.toast('«' + topic.name + '»: ' + words + ' слов, читать около ' + min + ' мин');
      }
    });
  }
};
`
  },
  {
    id: 'ai-quiz',
    name: 'Вопросы от ИИ',
    description: 'В меню темы: ИИ придумывает 5 вопросов по конспекту и добавляет их карточками (нужен ИИ-помощник).',
    code: `// @id ai-quiz
// @icon 🤖
// @name Вопросы от ИИ
// @version 1.0
// @author Мнема
// @description 5 карточек по конспекту от ИИ

export default {
  onload(app) {
    app.ui.addTopicAction({
      id: 'quiz',
      title: 'ИИ: 5 карточек по конспекту',
      async run(topic) {
        if (!topic.note.trim()) return app.ui.toast('Конспект пустой');
        app.ui.toast('ИИ думает…');
        try {
          const text = await app.ai.ask('Составь 5 вопросов для самопроверки по конспекту. Формат строго: Вопрос :: Ответ — по одной паре на строку, без нумерации.\\n\\n' + topic.note.slice(0, 6000));
          let n = 0;
          for (const line of text.split('\\n')) {
            const [q, a] = line.split('::').map((x) => x && x.trim());
            if (q && a) { app.data.addCard({ topicId: topic.id, front: q, back: a }); n++; }
          }
          app.ui.toast(n ? 'Добавлено карточек: ' + n : 'ИИ ответил не в том формате');
        } catch (e) {
          app.ui.toast('Не получилось: ' + e.message);
        }
      }
    });
  }
};
`
  }
];
