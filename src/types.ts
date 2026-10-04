export type CardType = 'basic' | 'reverse' | 'cloze' | 'typing' | 'problem';

export type ImportantType = 'bold' | 'definition' | 'date' | 'name' | 'formula' | 'term' | 'box' | 'mine';

export interface HighlightSettings {
  rules: Record<ImportantType, boolean>;
  strict: 'strict' | 'normal' | 'all';
  custom: string[]; // свои слова
  show: boolean; // подсвечивать в тексте конспекта
}

export interface TextbookSettings {
  mode: 'auto' | 'ai' | 'offline'; // auto — точно, если ИИ включён, иначе без интернета
  keepPhotos: boolean;
}

export interface PagePhoto {
  n: number; // номер страницы учебника
  img: string; // data:image/jpeg
}

/** Папка предметов: например, «Математика» → Алгебра, Геометрия, Вероятность. */
export interface Folder {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order?: number;
  createdAt: string;
  updatedAt?: string;
}

/** Домашнее задание. */
export interface Homework {
  id: string;
  subjectId?: string;
  topicId?: string;
  text: string;
  due?: string; // YYYY-MM-DD — к какому дню
  remind?: string; // ISO — когда напомнить
  photos?: string[]; // фото задания (JPEG data:) — доска, дневник, страница
  done?: boolean;
  doneAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  icon?: string; // эмодзи-значок
  folderId?: string;
  order?: number;
  topicSort?: 'name' | 'manual'; // темы: по названию с учётом чисел (по умолчанию) или как расставил сам
  createdAt: string;
  updatedAt?: string;
}

/** Список для заучивания внутри темы: словарь, термины, даты, формулы или свой. Каждая строка — карточка. */
export type ListKind = 'vocab' | 'terms' | 'dates' | 'formulas' | 'custom';
export type ListMode = 'basic' | 'reverse' | 'typing';
export interface StudyList {
  id: string;
  kind: ListKind;
  title: string;
  cols: [string, string, string]; // названия столбцов: что спрашиваем, ответ, пример/пояснение
  mode: ListMode; // как учить: показать ответ, в обе стороны, вписать ответ
  lang?: string; // язык для озвучки первого столбца (en-US и т. п.)
  widths?: [number, number, number]; // ширина столбцов (доли), меняется перетаскиванием границ
}

/** Стихотворение наизусть (вкладка темы). */
export interface Poem {
  id: string;
  title: string;
  author?: string;
  text: string;
  chunk: number; // строк в части; 0 — по строфам
  learned: number; // сколько частей уже выучено (по порядку)
  lineMiss?: number[]; // сколько раз ошибся или запнулся в строке
  review?: { due: string; interval: number; reps: number }; // когда повторить целиком
  history?: { at: string; acc: number; mode: 'learn' | 'whole' | 'random' | 'pick' }[];
  // Личные настройки: всё привязано к номеру строки (с нуля), поэтому от размера частей не зависит.
  knownLines?: number[]; // строки, которые уже выучены (или «уже знаю»); если поля нет — берётся из learned
  skipLines?: number[]; // строки, которые не учим (эпиграф, повтор, лишнее): остаются в тексте, но тренажёр их обходит
  focusLines?: number[]; // «повторять чаще»: попадаются в «С любого места» и в «Повторить отмеченное»
  lineCue?: Record<string, 0 | 1 | 2>; // своя подсказка строки по памяти: 0 — открыта, 1 — половина слов, 2 — первые буквы
  pinWords?: string[]; // слова, которые всегда открыты, вида «строка:слово» (номера с нуля)
  steps?: ('read' | 'half' | 'letters' | 'together')[]; // какие шаги учёбы оставить («по памяти» есть всегда); нет поля — все
  window?: number; // сколько предыдущих частей повторять вместе (по умолчанию 4)
  deadline?: string; // к какой дате выучить (ГГГГ-ММ-ДД): план «по N строк в день» и повторы не позже этой даты
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  kind?: 'rule' | 'glossary'; // правило предмета (вкладка «Правила») или общие термины предмета (вкладка «Термины»)
  ruleWords?: string[]; // слова, на которых правило всплывает подсказкой в конспектах предмета
  tabOrder?: string[]; // свой порядок вкладок темы: 'note', 'cards', 'list:<id>', 'poem:<id>'
  poems?: Poem[];
  subjectId: string;
  name: string;
  examDate?: string; // YYYY-MM-DD
  note: string; // Markdown (формулы — $…$ и $$…$$, рисунки — SVG-картинки data:)
  noteAt?: string; // ISO: когда последний раз менялся ТЕКСТ конспекта (а не другие поля) — по нему слияние не теряет правку текста
  noteFrom?: string; // ISO: noteAt версии текста, от которой начата правка (отличает продолжение чужой правки от независимой)
  noteBy?: string; // id устройства (AppData.deviceId), которое правило текст
  source?: string; // откуда импортирована (например, путь заметки Obsidian)
  parentId?: string; // подтема: id родительской темы (того же предмета)
  important?: boolean; // отмечена звёздочкой
  order?: number; // порядок среди соседей
  pages?: PagePhoto[]; // фото страниц учебника
  hiddenImportant?: string[]; // скрытые пункты «Важного»
  lists?: StudyList[]; // словари и списки темы
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: string;
  topicId: string;
  type: CardType;
  front: string; // для cloze — текст с {{пропусками}}
  back: string;
  why?: string;
  leechSeen?: boolean; // уже предлагали переписать «трудную» карточку
  page?: number; // страница учебника, откуда карточка
  listId?: string; // строка списка (словаря) темы
  createdAt: string;
  updatedAt: string;
}

/** Состояние FSRS одного «элемента» повторения (карточка + сторона/пропуск), даты в ISO. */
export interface ItemState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

/** 0 — угадываю, 1 — думаю, что знаю, 2 — точно знаю */
export type Confidence = 0 | 1 | 2;

export interface ReviewLogEntry {
  key: string; // `${cardId}:${ord}`
  cardId: string;
  topicId: string;
  rating: 1 | 2 | 3 | 4;
  prevState: number; // состояние FSRS до ответа
  confidence?: Confidence;
  /** Ручная пометка ошибки (по желанию): не помню / перепутал / не понял. Тип ошибки автоматически не определить. */
  err?: 'forgot' | 'mixed' | 'lost';
  mix?: string; // с каким элементом (key) перепутал — для err: 'mixed'
  at: string;
  ms: number; // сколько думал над ответом
}

export interface TestResult {
  id: string;
  topicId: string;
  at: string;
  total: number;
  correct: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'normal' | 'comfy';

/** Возможности, которые включаются на экране «Возможности». */
export type FeatureId = 'schedule' | 'obsidian' | 'confidence' | 'ai' | 'handwriting' | 'map' | 'tray' | 'voice' | 'lists' | 'rules' | 'homework' | 'why' | 'poems' | 'mods';

export type MotionLevel = 'all' | 'essential' | 'off' | 'custom';
export type MotionKind = 'screens' | 'windows' | 'expand' | 'text' | 'review' | 'hover' | 'lists' | 'press' | 'guide';

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  front: string;
  back?: string;
  why?: string;
}

/** Мод: оформление, которым можно поделиться (только стили, без программ). */
export interface Mod {
  id: string;
  name: string;
  description: string;
  author?: string;
  css?: string;
  look?: Partial<Look>;
  accent?: string;
  icon?: string; // значок в списке
  where?: string; // где видно изменение
  font?: string; // шрифт, который нужно подгрузить (id из FONTS)
}

/** Мод с кодом: сохранённый текст программы и описание. */
export interface PluginRec {
  id: string;
  name: string;
  version: string;
  author?: string;
  description: string;
  code: string;
  enabled: boolean;
  fromCatalog?: boolean;
  icon?: string;
}

export interface Look {
  style?: 'modern' | 'classic'; // стиль интерфейса
  light: string; // id светлой темы
  dark: string; // id тёмной темы
  font: string; // основной шрифт
  headFont: 'literata' | 'same';
  radius: 'sharp' | 'normal' | 'round';
  background: 'plain' | 'dots' | 'grid' | 'lines';
  custom: { light?: Record<string, string>; dark?: Record<string, string> }; // свои цвета поверх темы
}

export interface Settings {
  look: Look;
  styleBackup?: Record<string, { look: Look; accent: string }>; // оформление до включения стиля из файла — чтобы вернуть
  homeworkRemind: { on: boolean; time: string; when: 'dayBefore' | 'sameDay' }; // напоминания о ДЗ по умолчанию
  lessonsRemind: { on: boolean; time: string }; // вечером: «завтра такие-то уроки — повтори»
  update: { owner: string; repo: string; auto: boolean; lastCheck?: string }; // где искать новые версии (GitHub)
  appIcon?: string; // значок на рабочем столе телефона: 'default', 'theme' (под тему) или id темы (свой выбор)
  bgImage?: { src: string; fade: number }; // свой фон картинкой (JPEG data:); fade 0.5–0.95 — насколько её прикрывает цвет темы
  cardTemplates: CardTemplate[]; // свои шаблоны карточек
  modsOn: string[]; // включённые моды
  customMods: Mod[]; // моды из файлов
  userCss: string; // свой CSS
  plugins: PluginRec[]; // моды с кодом (как плагины Obsidian)
  pluginsSafe: boolean; // безопасный режим: моды с кодом не запускаются
  pluginData: Record<string, Record<string, unknown>>; // что моды сохранили
  motion: MotionLevel; // анимации: все, только важные, выключены, выборочно
  motionOff: MotionKind[]; // для «выборочно»: какие выключены
  theme: ThemeMode;
  accent: string;
  fontScale: number; // 0.9–1.3
  density: Density;
  retention: number; // 0.80–0.95
  newPerDay: number;
  sessionMinutes?: number; // «Учиться»: сколько минут есть (5, 10, 20); нет или 0 — всё на сегодня
  sessionSkip?: { day: string; kinds: string[] }; // шаги плана, которые пропустили в этот день
  maxReviews: number;
  dayStartHour: number;
  showIntervals: boolean;
  simpleButtons: boolean; // две кнопки: «Не помню» / «Помню»
  askConfidence: boolean; // устарело, заменено features.confidence
  features: Record<FeatureId, boolean>;
  schedule: Record<string, string[]>; // '1'…'6' (пн…сб) → id предметов
  focusMinutes: number;
  breakMinutes: number;
  leechThreshold: number;
  onboarded: boolean;
  hiddenTips?: string[]; // подсказки на экранах, которые закрыли крестиком
  reminder: string | null; // время напоминания «ЧЧ:ММ»
  trayHotkey: boolean;
  closeToTray: boolean;
  autostart: boolean;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  treeOpen: string[]; // раскрытые предметы и темы в боковой панели
  keys: Partial<Record<string, string>>; // свои горячие клавиши (только изменённые)
  graph: GraphSettings;
  highlight: HighlightSettings;
  textbook: TextbookSettings;
  cloud: import('./cloud').CloudSettings | null;
}

export interface GraphSettings {
  repel: number; // сила отталкивания
  linkDistance: number;
  nodeSize: number;
  labels: 'auto' | 'always' | 'never';
  showTerms: boolean;
}

/** Контрольная: предмет, несколько тем, дата. Старые «даты контрольной» у тем (`Topic.examDate`) читаются как контрольные «на лету» (`src/exams.ts`), пока их не изменили. */
export interface Exam {
  id: string;
  subjectId: string;
  name: string;
  date: string; // YYYY-MM-DD
  topicIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Что удалено одним действием — чтобы можно было нажать «Вернуть» (сразу после удаления или потом из корзины). */
export interface Removed {
  subjects: Subject[];
  topics: Topic[];
  cards: Card[];
  states: Record<string, ItemState>;
  logs: ReviewLogEntry[];
  marks: string[];
}

/** Прежняя версия текста конспекта (история лежит только на этом устройстве). */
export interface NoteVersion {
  at: string; // когда этот текст перестал быть текущим (его заменили правкой)
  note: string;
}

/** Корзина: недавно удалённое. Живёт только на этом устройстве (в облако и по Wi-Fi не уходит). */
export interface TrashEntry {
  id: string;
  at: string;
  label: string;
  removed: Removed;
}

export interface AppData {
  version: 1;
  folders: Folder[];
  homework: Homework[];
  exams?: Exam[];
  trash?: TrashEntry[];
  noteHistory?: Record<string, NoteVersion[]>; // id темы → прежние версии конспекта, свежие первыми
  subjects: Subject[];
  topics: Topic[];
  cards: Card[];
  states: Record<string, ItemState>;
  logs: ReviewLogEntry[];
  tests: TestResult[];
  settings: Settings;
  deleted?: Record<string, string>; // что и когда удалено — чтобы синхронизация не «воскрешала» удалённое
  deviceId?: string;
}

export type SettingsSection = 'look' | 'text' | 'motion' | 'styles' | 'features' | 'study' | 'reminders' | 'ai' | 'keys' | 'data' | 'mods' | 'about';

export type Route =
  | { name: 'today' }
  | { name: 'knowledge' }
  | { name: 'profile' }
  | { name: 'subject'; id: string; view?: 'topics' | 'rules' | 'terms' | 'timeline'; filter?: string }
  | { name: 'folder'; id: string }
  | { name: 'homework' }
  | { name: 'plugin'; id: string }
  | { name: 'exam'; id: string } // экран подготовки к контрольной; id вида `topic:<id>` — контрольная из старой даты темы
  | { name: 'topic'; id: string; tab?: string; page?: boolean } // 'note' | 'cards' | 'list:<id>'; page — правило страницей, а не окном
  | { name: 'review'; topicId?: string; subjectId?: string; subjectIds?: string[]; cardIds?: string[]; cram?: boolean; ahead?: boolean; session?: { minutes?: number; skip?: string[] }; focus?: boolean; run?: number; limit?: number; mini?: boolean }
  | { name: 'test'; topicId: string; pretest?: boolean; examId?: string }
  | { name: 'stats'; tab?: 'numbers' | 'map' }
  | { name: 'trash' }
  | { name: 'settings'; section?: SettingsSection }
  | { name: 'features' }
  | { name: 'help'; section?: 'learn' | 'use' };
