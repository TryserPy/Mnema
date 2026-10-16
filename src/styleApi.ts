// Публичный «API оформления» Refrain: что стиль может менять и как это называется. Это обещание не ломать имена между версиями.
// Всё здесь показывается в справке редактора стилей; тест src/styleApi.test.ts сверяет список с настоящим CSS, чтобы описание не устаревало.

export interface ApiVar {
  name: string;
  doc: string;
  /** Значение по умолчанию, если стиль его не менял. */
  def?: string;
  /** Короткое понятное название для редактора (если нет — показывается имя переменной). */
  label?: string;
  /** Считается приложением само из других цветов (редактор показывает подсказку). */
  auto?: boolean;
}
export interface ApiGroup {
  id: string;
  title: string;
  vars: ApiVar[];
  /** Что в группе: цвета ('color') или всё остальное (размеры, шрифты, тени…). */
  kind?: 'color' | 'other';
}

export const API_VARS: ApiGroup[] = [
  {
    id: 'colors-accent',
    title: 'Главный цвет',
    kind: 'color',
    vars: [
      { name: '--accent', label: 'Главный цвет', doc: 'Главный цвет: кнопки, ссылки, выбранное.' },
      { name: '--on-accent', label: 'Текст на главном цвете', doc: 'Цвет текста на плашке главного цвета (считается сам).', auto: true },
      { name: '--accent-text', label: 'Главный цвет как текст', doc: 'Главный цвет как цвет текста на фоне темы (читается на любом фоне; считается сам).', auto: true }
    ]
  },
  {
    id: 'colors-bg',
    title: 'Фоны',
    kind: 'color',
    vars: [
      { name: '--bg', label: 'Фон окна', doc: 'Фон окна.' },
      { name: '--side', label: 'Боковая панель', doc: 'Фон боковой панели.' },
      { name: '--surface', label: 'Карточки и окна', doc: 'Фон карточек, окон и меню.' },
      { name: '--surface-2', label: 'Вложенные плашки', doc: 'Чуть другой фон для вложенных плашек.' },
      { name: '--sunken', label: 'Утопленный фон', doc: 'Утопленный фон: полосы, чипы, подложка переключателей.' }
    ]
  },
  {
    id: 'colors-text',
    title: 'Текст',
    kind: 'color',
    vars: [
      { name: '--ink', label: 'Основной текст', doc: 'Основной цвет текста.' },
      { name: '--ink-2', label: 'Второй текст', doc: 'Второй по важности цвет текста.' },
      { name: '--muted', label: 'Приглушённый текст', doc: 'Приглушённый текст: подписи, подсказки.' }
    ]
  },
  {
    id: 'colors-lines',
    title: 'Линии и рамки',
    kind: 'color',
    vars: [
      { name: '--line', label: 'Тонкие линии', doc: 'Тонкие линии и рамки.' },
      { name: '--line-2', label: 'Рамки полей и кнопок', doc: 'Рамки полей и кнопок.' }
    ]
  },
  {
    id: 'colors-marks',
    title: 'Выделение и подсказки',
    kind: 'color',
    vars: [
      { name: '--mark', label: 'Выделение в конспекте', doc: 'Цвет выделения в конспекте.' },
      { name: '--tip-bg', label: 'Подсказка: фон', doc: 'Фон подсказок и плашек-советов.' },
      { name: '--tip-line', label: 'Подсказка: рамка', doc: 'Рамка подсказок и плашек-советов.' },
      { name: '--tip-ink', label: 'Подсказка: текст', doc: 'Текст подсказок и плашек-советов.' }
    ]
  },
  {
    id: 'colors-grades',
    title: 'Кнопки оценки',
    kind: 'color',
    vars: [
      { name: '--again-bg', label: '«Снова»: фон', doc: 'Фон кнопки «Снова».' },
      { name: '--again-ink', label: '«Снова»: текст', doc: 'Цвет текста «Снова».' },
      { name: '--hard-bg', label: '«Трудно»: фон', doc: 'Фон кнопки «Трудно».' },
      { name: '--hard-ink', label: '«Трудно»: текст', doc: 'Цвет текста «Трудно».' },
      { name: '--good-bg', label: '«Хорошо»: фон', doc: 'Фон кнопки «Хорошо».' },
      { name: '--good-ink', label: '«Хорошо»: текст', doc: 'Цвет текста «Хорошо».' },
      { name: '--easy-bg', label: '«Легко»: фон', doc: 'Фон кнопки «Легко».' },
      { name: '--easy-ink', label: '«Легко»: текст', doc: 'Цвет текста «Легко».' }
    ]
  },
  {
    id: 'fonts',
    title: 'Шрифты и текст',
    kind: 'other',
    vars: [
      { name: '--body', doc: 'Шрифт текста. Ставь с !important: тему задаёт его на самом <html>.', def: "'Onest', 'Segoe UI', system-ui, sans-serif" },
      { name: '--display', doc: 'Шрифт заголовков и крупных чисел (!important так же).', def: "'Literata', Georgia, serif" },
      { name: '--mono', doc: 'Моноширинный шрифт: код, формулы-исходники, пути.', def: "'Cascadia Mono', Consolas, ui-monospace, monospace" },
      { name: '--rf-body-lh', doc: 'Межстрочный интервал всего текста (в конспекте — свой, --rf-note-lh).', def: '1.45' },
      { name: '--rf-note-font', doc: 'Шрифт текста конспекта (по умолчанию как у всего остального).', def: 'inherit' },
      { name: '--rf-question-size', doc: 'Размер вопроса на карточке при повторении.', def: '1.8rem' },
      { name: '--rf-note-size', doc: 'Размер текста конспекта.', def: '1.06rem' },
      { name: '--rf-note-lh', doc: 'Межстрочный интервал конспекта.', def: '1.7' }
    ]
  },
  {
    id: 'layout',
    title: 'Размеры и отступы',
    vars: [
      { name: '--side-w', doc: 'Ширина боковой панели.', def: '248px' },
      { name: '--pad', doc: 'Внутренний отступ карточек.', def: '18px' },
      { name: '--gap', doc: 'Промежуток между блоками на экране.', def: '16px' },
      { name: '--rf-content-w', doc: 'Максимальная ширина содержимого экрана.', def: '1060px' },
      { name: '--rf-content-w-wide', doc: 'Ширина «широких» экранов.', def: '1100px' },
      { name: '--rf-content-w-narrow', doc: 'Ширина «узких» экранов (настройки, «Готово!»).', def: '780px' },
      { name: '--rf-review-w', doc: 'Ширина экрана повторения.', def: '780px' },
      { name: '--rf-page-pad', doc: 'Отступы вокруг содержимого экрана (как padding: сверху справа/слева снизу).', def: '36px 40px 56px' },
      { name: '--rf-list-gap', doc: 'Промежуток между строками списка тем.', def: '8px' },
      { name: '--rf-row-pad', doc: 'Отступы внутри строки темы.', def: '16px 18px' },
      { name: '--rf-tile-w', doc: 'Минимальная ширина плитки темы (когда темы плитками).', def: '230px' },
      { name: '--rf-hero-pad', doc: 'Отступы внутри большой плашки «На сегодня».', def: '26px 28px' },
      { name: '--rf-review-pad', doc: 'Отступы внутри карточки повторения.', def: '30px 34px' },
      { name: '--rf-note-pad', doc: 'Отступы внутри страницы конспекта.', def: '34px 48px 60px' },
      { name: '--rf-btn-pad', doc: 'Боковые отступы кнопки.', def: '16px' },
      { name: '--rf-grades-gap', doc: 'Промежуток между кнопками оценки.', def: '10px' }
    ]
  },
  {
    id: 'sizes',
    title: 'Высота кнопок и полей',
    vars: [
      { name: '--rf-btn-h', doc: 'Высота обычной кнопки.', def: '42px' },
      { name: '--rf-btn-h-small', doc: 'Высота маленькой кнопки.', def: '34px' },
      { name: '--rf-btn-h-big', doc: 'Высота большой кнопки («Показать ответ»).', def: '58px' },
      { name: '--rf-input-h', doc: 'Высота поля ввода.', def: '42px' },
      { name: '--rf-nav-h', doc: 'Высота пункта меню слева.', def: '42px' },
      { name: '--rf-tab-h', doc: 'Высота вкладки темы.', def: '44px' },
      { name: '--rf-grade-h', doc: 'Высота кнопки оценки.', def: '70px' }
    ]
  },
  {
    id: 'colors-callouts',
    title: 'Конспект → Выноски',
    kind: 'color',
    vars: [
      { name: '--co-def', label: 'Определение', doc: 'Цвет выноски «Определение» ([!def]): рамка, заголовок, бледный фон.', def: '#3d6fd1' },
      { name: '--co-rule', label: 'Правило', doc: 'Цвет выноски «Правило» ([!rule]).', def: '#2f8f5b' },
      { name: '--co-tip', label: 'Запомни', doc: 'Цвет выноски «Запомни» ([!tip]).', def: 'главный цвет' },
      { name: '--co-ex', label: 'Пример', doc: 'Цвет выноски «Пример» ([!ex]).', def: '#7a6a58' },
      { name: '--co-warn', label: 'Внимание', doc: 'Цвет выноски «Внимание» ([!warn]).', def: '#c8553d' }
    ]
  },
  {
    id: 'shapes',
    title: 'Формы и тени',
    vars: [
      { name: '--radius', doc: 'Скругление карточек.', def: '16px' },
      { name: '--rf-radius-btn', doc: 'Скругление кнопок.', def: '11px' },
      { name: '--rf-radius-btn-big', doc: 'Скругление больших кнопок.', def: '14px' },
      { name: '--rf-radius-input', doc: 'Скругление полей ввода.', def: '11px' },
      { name: '--rf-radius-grade', doc: 'Скругление кнопок оценки.', def: '16px' },
      { name: '--rf-radius-review', doc: 'Скругление карточки повторения.', def: '26px' },
      { name: '--rf-radius-note', doc: 'Скругление страницы конспекта.', def: '20px' },
      { name: '--rf-radius-hero', doc: 'Скругление плашки «На сегодня».', def: '24px' },
      { name: '--rf-radius-row', doc: 'Скругление строки темы.', def: '14px' },
      { name: '--rf-radius-modal', doc: 'Скругление окон.', def: '22px' },
      { name: '--rf-radius-menu', doc: 'Скругление меню.', def: '14px' },
      { name: '--rf-radius-nav', doc: 'Скругление пунктов меню слева.', def: '10px' },
      { name: '--rf-border-w', doc: 'Толщина рамки карточек, конспекта и строк.', def: '1px' },
      { name: '--shadow', doc: 'Тень карточек.' },
      { name: '--rf-card-shadow', doc: 'Тень и рамка-«кольцо» карточек в стиле «Современный» (у «Классического» — --shadow).', def: '0 0 0 1px (линия 80%), 0 1px 3px (почти прозрачная)' },
      { name: '--shadow-pop', doc: 'Тень выпадающих окон и меню.' }
    ]
  }
];

export interface ApiClass {
  name: string;
  doc: string;
}

/** Стабильные классы: за их именами следим между версиями. */
export const API_CLASSES: ApiClass[] = [
  { name: '.app', doc: 'Всё приложение (боковая панель + экран).' },
  { name: '.sidebar', doc: 'Боковая панель.' },
  { name: '.brand', doc: 'Логотип и название вверху панели.' },
  { name: '.nav', doc: 'Главное меню: Создать, Сегодня, Знания…' },
  { name: '.nav-item', doc: 'Пункт главного меню (.on — открытый).' },
  { name: '.tree', doc: 'Дерево папок, предметов и тем.' },
  { name: '.tree-row', doc: 'Строка дерева (.subject — предмет, .folder — папка).' },
  { name: '.side-foot', doc: 'Нижняя полоса панели: статистика, настройки, справка.' },
  { name: '.main', doc: 'Область экрана справа от панели.' },
  { name: '.page', doc: 'Колонка с содержимым экрана (.narrow, .wide — уже и шире).' },
  { name: '.display', doc: 'Большие заголовки экранов.' },
  { name: '.card', doc: 'Обычная карточка-плашка.' },
  { name: '.btn', doc: 'Кнопка (.primary — главная, .ghost — без рамки, .small, .big).' },
  { name: '.icon-btn', doc: 'Кнопка-значок.' },
  { name: '.input', doc: 'Поле ввода.' },
  { name: '.badge', doc: 'Счётчик в меню.' },
  { name: '.chip', doc: 'Короткая подпись-«пилюля».' },
  { name: '.seg', doc: 'Переключатель из нескольких кнопок.' },
  { name: '.hero', doc: 'Большая плашка «На сегодня» (.hero-num, .hero-btn).' },
  { name: '.topic-head', doc: 'Шапка темы.' },
  { name: '.topic-list', doc: 'Список тем предмета.' },
  { name: '.topic-row', doc: 'Строка темы.' },
  { name: '.topic-tabs', doc: 'Полоса вкладок темы.' },
  { name: '.otab', doc: 'Вкладка темы (.on — открытая).' },
  { name: '.note-page', doc: 'Страница конспекта.' },
  { name: '.note-doc', doc: 'Сам текст конспекта.' },
  { name: '.card-row', doc: 'Карточка в списке карточек темы.' },
  { name: '.review', doc: 'Экран повторения.' },
  { name: '.review-card', doc: 'Карточка при повторении.' },
  { name: '.question', doc: 'Вопрос на карточке.' },
  { name: '.grades', doc: 'Ряд кнопок оценки.' },
  { name: '.grade', doc: 'Кнопка оценки (.again, .hard, .good, .easy).' },
  { name: '.modal-back', doc: 'Затемнение за окном.' },
  { name: '.modal', doc: 'Окно.' },
  { name: '.menu', doc: 'Выпадающее меню.' },
  { name: '.hw-row', doc: 'Строка домашнего задания.' },
  { name: '.list-table', doc: 'Таблица словаря или терминов.' }
];

export interface ApiAttr {
  name: string;
  doc: string;
}

/** Атрибуты, которые приложение ставит на <html> само: их можно использовать в селекторах. */
export const API_ROOT_ATTRS: ApiAttr[] = [
  { name: "data-theme", doc: "'light' или 'dark' — тема. Для тёмной: :root[data-theme='dark'] …" },
  { name: 'data-density', doc: "'compact', 'normal' или 'comfy' — плотность из «Оформления»." },
  { name: 'data-style', doc: "'modern' или 'classic' — прежний выбор стиля интерфейса." },
  { name: 'data-radius', doc: "'sharp', 'normal' или 'round' — скругления из «Оформления»." },
  { name: 'data-motion', doc: "'on' или 'off' — анимации." },
  { name: 'data-touch', doc: "'1' на телефоне и планшете." }
];

/** Метки частей интерфейса: [data-part='sidebar'] и так далее — не зависят от названий классов. */
export const API_PARTS: ApiAttr[] = [
  { name: 'app', doc: 'Всё приложение.' },
  { name: 'sidebar', doc: 'Боковая панель.' },
  { name: 'nav', doc: 'Главное меню.' },
  { name: 'main', doc: 'Область экрана.' },
  { name: 'tabs', doc: 'Вкладки темы.' },
  { name: 'topic-list', doc: 'Список тем.' },
  { name: 'note', doc: 'Страница конспекта.' },
  { name: 'review-card', doc: 'Карточка повторения.' },
  { name: 'grades', doc: 'Кнопки оценки.' },
  { name: 'modal', doc: 'Окно.' }
];
