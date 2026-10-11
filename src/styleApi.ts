// Публичный «API оформления» Refrain: что стиль может менять и как это называется. Это обещание не ломать имена между версиями.
// Всё здесь показывается в справке редактора стилей; тест src/styleApi.test.ts сверяет список с настоящим CSS, чтобы описание не устаревало.

export interface ApiVar {
  name: string;
  doc: string;
  /** Значение по умолчанию, если стиль его не менял. */
  def?: string;
}
export interface ApiGroup {
  id: string;
  title: string;
  vars: ApiVar[];
}

export const API_VARS: ApiGroup[] = [
  {
    id: 'colors',
    title: 'Цвета',
    vars: [
      { name: '--accent', doc: 'Главный цвет: кнопки, ссылки, выбранное.' },
      { name: '--on-accent', doc: 'Цвет текста на плашке главного цвета (считается сам).' },
      { name: '--accent-text', doc: 'Главный цвет как цвет текста на фоне темы (читается на любом фоне).' },
      { name: '--bg', doc: 'Фон окна.' },
      { name: '--side', doc: 'Фон боковой панели.' },
      { name: '--surface', doc: 'Фон карточек, окон и меню.' },
      { name: '--surface-2', doc: 'Чуть другой фон для вложенных плашек.' },
      { name: '--sunken', doc: 'Утопленный фон: полосы, чипы, подложка переключателей.' },
      { name: '--ink', doc: 'Основной цвет текста.' },
      { name: '--ink-2', doc: 'Второй по важности цвет текста.' },
      { name: '--muted', doc: 'Приглушённый текст: подписи, подсказки.' },
      { name: '--line', doc: 'Тонкие линии и рамки.' },
      { name: '--line-2', doc: 'Рамки полей и кнопок.' },
      { name: '--mark', doc: 'Цвет выделения в конспекте.' },
      { name: '--again-bg', doc: 'Фон кнопки «Снова» (ещё: --hard-bg, --good-bg, --easy-bg).' },
      { name: '--again-ink', doc: 'Цвет текста «Снова» (ещё: --hard-ink, --good-ink, --easy-ink).' },
      { name: '--tip-bg', doc: 'Фон подсказок и плашек-советов (ещё: --tip-line, --tip-ink).' }
    ]
  },
  {
    id: 'fonts',
    title: 'Шрифты',
    vars: [
      { name: '--body', doc: 'Шрифт текста. Ставь с !important: тему задаёт его на самом <html>.', def: "'Onest', 'Segoe UI', system-ui, sans-serif" },
      { name: '--display', doc: 'Шрифт заголовков и крупных чисел (!important так же).', def: "'Literata', Georgia, serif" },
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
