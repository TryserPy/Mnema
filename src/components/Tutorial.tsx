// Знакомство «как в играх»: подсвечивает нужное место, а человек делает всё сам — создаёт предмет, тему, пишет конспект, делает карточку.
// Шаг определяется по тому, что есть на самом деле (есть ли новый предмет, тема, конспект, карточка; открыто ли окно), а не по счётчику:
// закрыл окно, удалил созданное, ушёл на другой экран — подсказка сама возвращается на нужный шаг.
// «Пропустить шаг» делает шаг за человека (создаёт предмет, тему, пишет пример конспекта, карточку); «Выйти» — закончить.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { addCard, addSubject, addTopic, getData, updateSettings, updateTopic, useData } from '../store';
import { noteWriter } from '../noteRegistry';
import type { AppData, Route, Topic } from '../types';
import { lowSidePlace, MAJORS, needsScroll, stepInfo, useDomTick, useRect, type Rect } from './guideTarget';
import { Icon, selHow, toast } from './ui';
import '../guide.css';

// Состояние живёт вне компонента: при переходе в повторение приложение перерисовывается целиком, а знакомство должно продолжаться.
interface State {
  active: boolean;
  skipped: number[]; // какие крупные шаги пропущены вручную
  learned: boolean; // повторение открывали
  base: { subjects: Set<string>; topics: Set<string>; cards: Set<string> }; // что было до начала — «новое» считаем от этого
}
let st: State = { active: false, skipped: [], learned: false, base: { subjects: new Set(), topics: new Set(), cards: new Set() } };
const subs = new Set<() => void>();
const setSt = (patch: Partial<State>) => {
  st = { ...st, ...patch };
  subs.forEach((f) => f());
};

/** Начать интерактивное знакомство (из «Знакомства», «Справки», «О Refrain»). */
export function startTutorial() {
  const d = getData();
  setSt({ active: true, skipped: [], learned: false, base: { subjects: new Set(d.subjects.map((x) => x.id)), topics: new Set(d.topics.map((x) => x.id)), cards: new Set(d.cards.map((x) => x.id)) } });
}

export const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const visible = (e: HTMLElement) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
export const byText = (sel: string, text: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => visible(e) && (e.textContent ?? '').includes(text)) ?? null;
/** Кнопка «Создать»: на телефоне — в верхней полосе, иначе в панели; берём ту, что сейчас видна (стиль мог спрятать одну из них). */
/** Кнопка узкой панели (стиль «Фокус» или свёрнутая панель): подписей нет, есть только aria-label. */
const railBtn = (label: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.sidebar.rail button')].find((e) => visible(e) && e.getAttribute('aria-label') === label) ?? null;
export const createBtn = () => [...document.querySelectorAll<HTMLElement>('.mobile-bar .mobile-create, .sidebar .create-btn')].find(visible) ?? q('.mobile-bar .mobile-create') ?? q('.sidebar .create-btn');
/** Телефонная раскладка — по тому же условию, что у приложения (useMobile в App.tsx и @media (max-width: 720px) в стилях). */
export const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
const menuOpen = () => Boolean(q('.modal .create-item'));
const dialogTitle = () => q('.modal h2')?.textContent ?? '';
const anyModal = () => Boolean(q('.modal'));

/** Крупные шаги (MAJORS в guideTarget.ts) — пять; последний экран («Готово») — не шаг и в счёт не входит. */
/** Номер финального экрана «Готово». */
const LAST = MAJORS.length;
/** Через сколько на одном шаге напомнить про «Пропустить шаг». */
const STUCK_MS = 25000;
const DONE_FLASH = ['Предмет создан', 'Тема создана', 'Конспект написан', 'Карточка готова', 'Повторение открыто'];

interface Ctx {
  data: AppData;
  route: Route;
  newSubjects: { id: string; name: string }[];
  newTopics: Topic[];
  noteTopic?: Topic;
  /** Тема, где конспект уже начат, но ещё короче нужного, — чтобы подсказать «допиши», а не молчать. */
  shortNoteTopic?: Topic;
  cardsNew: number;
}

/** Сколько знаков конспекта хватает, чтобы шаг засчитался: короткая запись «Клетка — основа жизни» тоже годится. */
export const NOTE_MIN = 8;
const noteLen = (t: Topic) => t.note.replace(/\s+/g, ' ').trim().length;

function context(data: AppData, route: Route): Ctx {
  const newSubjects = data.subjects.filter((s) => !st.base.subjects.has(s.id));
  const newTopics = data.topics.filter((t) => !t.kind && !st.base.topics.has(t.id));
  const noteTopic = newTopics.find((t) => noteLen(t) >= NOTE_MIN);
  return { data, route, newSubjects, newTopics, noteTopic, shortNoteTopic: noteTopic ? undefined : newTopics.find((t) => noteLen(t) > 0), cardsNew: data.cards.filter((c) => !st.base.cards.has(c.id)).length };
}

/** Какой крупный шаг сейчас: первый, который не сделан (и не пропущен). */
function currentMajor(c: Ctx): number {
  const sk = st.skipped;
  if (!sk.includes(0) && c.newSubjects.length === 0) return 0;
  if (!sk.includes(1) && c.newTopics.length === 0) return 1;
  if (!sk.includes(2) && !c.noteTopic) return 2;
  if (!sk.includes(3) && c.cardsNew === 0) return 3;
  if (!sk.includes(4) && !st.learned) return 4;
  return LAST;
}

/** Наша тема, с которой работаем (созданная в знакомстве; если её нет — та, что сейчас открыта). */
function workTopic(c: Ctx): Topic | undefined {
  const open = c.route.name === 'topic' ? c.data.topics.find((t) => t.id === (c.route as { id: string }).id) : undefined;
  return c.newTopics.find((t) => open && t.id === open.id) ?? c.noteTopic ?? c.newTopics[0] ?? open;
}

/** Подсветить путь к теме: строка темы в панели → предмет → «Знания». */
function openTopicTarget(c: Ctx, t: Topic): HTMLElement | null {
  const subject = c.data.subjects.find((s) => s.id === t.subjectId);
  return (
    byText('.main .topic-row, .main .know-found-row', t.name) ??
    byText('.sidebar .tree-row:not(.subject):not(.folder) .tree-label', t.name) ??
    (subject ? (byText('.main .know-tile', subject.name) ?? byText('.sidebar .tree-row.subject .tree-label', subject.name) ?? railBtn(subject.name)) : null) ??
    byText('.tab', 'Знания') ??
    byText('.sidebar .nav-item', 'Знания')
  );
}

interface Stage {
  major: number;
  /** Сколько действий осталось до конца крупного шага, считая это: для «Шаг N из М» (см. actionNumber в guideTarget.ts). Ушёл в сторону — больше, и номер откатывается. */
  left: number;
  text: ReactNode;
  hint?: ReactNode;
  target: HTMLElement | null;
}

function stageOf(c: Ctx): Stage {
  const major = currentMajor(c);
  const onTopic = c.route.name === 'topic';
  const topic = workTopic(c);
  const inOurTopic = Boolean(topic && onTopic && (c.route as { id: string }).id === topic.id);
  switch (major) {
    case 0:
      if (dialogTitle() === 'Новый предмет') return { major, left: 1, text: 'Назови предмет — например, «Биология» — и нажми «Создать».', target: q('.modal') };
      if (menuOpen()) return { major, left: 2, text: 'Выбери «Новый предмет».', target: byText('.modal .create-item', 'Новый предмет') };
      return { major, left: 3, text: 'Нажми «Создать» — отсюда создаётся всё.', target: createBtn() };
    case 1:
      if (dialogTitle() === 'Новая тема') return { major, left: 1, text: 'Назови тему — например, «§1 Клетка» — и нажми «Создать».', target: q('.modal') };
      if (menuOpen()) return { major, left: 2, text: 'Выбери «Новая тема».', target: byText('.modal .create-item', 'Новая тема') };
      return { major, left: 3, text: 'Теперь тема — один параграф или раздел. Нажми «Создать» и выбери «Новая тема».', target: createBtn() };
    case 2:
      if (!inOurTopic) return topic ? { major, left: 3, text: <>Открой свою тему «{topic.name}» — в ней пишется конспект.</>, target: anyModal() ? q('.modal') : openTopicTarget(c, topic) } : { major, left: 3, text: 'Открой любую тему — в ней пишется конспект.', target: byText('.tab', 'Знания') ?? byText('.sidebar .nav-item', 'Знания') };
      if (!q('.ProseMirror')) return { major, left: 2, text: 'Открой вкладку «Конспект».', target: byText('.topic-tabs [role="tab"], .topic-tabs button', 'Конспект') };
      return {
        major,
        left: 1,
        text: 'Напиши в конспекте пару предложений своими словами — главное из темы.',
        hint: c.shortNoteTopic ? 'Почти! Допиши ещё пару слов — и пойдём дальше.' : 'Не переписывай учебник: своими словами запоминается лучше.',
        target: q('.ProseMirror')
      };
    case 3:
      if (anyModal()) return { major, left: 1, text: 'Заполни вопрос и ответ и нажми «Сохранить».', target: q('.modal') };
      if (!inOurTopic) return topic ? { major, left: 4, text: <>Вернись в тему «{topic.name}» — карточку делают из конспекта.</>, target: openTopicTarget(c, topic) } : { major, left: 4, text: 'Открой тему с конспектом.', target: byText('.tab', 'Знания') };
      if (!q('.ProseMirror')) return { major, left: 3, text: 'Открой вкладку «Конспект».', target: byText('.topic-tabs [role="tab"], .topic-tabs button', 'Конспект') };
      return { major, left: 2, text: <>Сделай карточку: {selHow('В карточку')}.</>, hint: 'Одна карточка — один факт.', target: q('.ProseMirror') };
    case 4:
      if (anyModal()) return { major, left: 3, text: 'Закрой это окно — и вернёмся к повторению.', target: q('.modal') };
      // Нажимать нечего (на сегодня ничего не назначено) — не оставляем человека с мёртвой кнопкой.
      if (c.route.name === 'today' && (q('.hero-btn') as HTMLButtonElement | null)?.disabled) return { major, left: 1, text: 'Сегодня повторять пока нечего — так бывает. Нажми «Пропустить шаг», чтобы закончить знакомство.', target: null };
      return { major, left: c.route.name === 'today' ? 1 : 2, text: 'Теперь повторение. Вернись на «Сегодня» и нажми «Учиться».', target: c.route.name === 'today' ? q('.hero-btn') : (byText('.tab', 'Учусь') ?? byText('.sidebar .nav-item', 'Сегодня') ?? railBtn('Сегодня')) };
    default:
      return { major: LAST, left: 1, text: 'Готово! Так выглядит повторение: сначала вспомни ответ сам, потом открой и честно оцени. Refrain сам решит, когда показать карточку снова.', target: null };
  }
}

const SAMPLE_NOTE = 'Клетка — это наименьшая единица строения и жизни всех организмов. У неё есть оболочка, цитоплазма и ядро.';

/** Закрыть открытые окна (как Esc): иначе «сделанное за тебя» оказалось бы под окном. */
function closeModals() {
  for (let i = 0; i < 3 && q('.modal'); i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

/** «Пропустить шаг»: сделать его за человека, чтобы следующий шаг было на чём делать. */
function doStep(major: number, c: Ctx, go: (r: Route) => void) {
  closeModals();
  // Шаг считаем пройденным сразу — не дожидаясь, что приложение «заметит» созданное: кнопка не должна подвести.
  if (!st.skipped.includes(major)) setSt({ skipped: [...st.skipped, major] });
  const d = getData();
  const subject = c.newSubjects[c.newSubjects.length - 1] ?? d.subjects[0];
  const ensureSubject = () => subject ?? addSubject('Биология', '#2BA36B');
  const ensureTopic = (): Topic => workTopic(context(getData(), c.route)) ?? addTopic(ensureSubject().id, '§1 Клетка');
  if (major === 0) addSubject('Биология', '#2BA36B');
  else if (major === 1) {
    const t = addTopic(ensureSubject().id, '§1 Клетка');
    go({ name: 'topic', id: t.id });
  } else if (major === 2) {
    const t = ensureTopic();
    const w = noteWriter(t.id);
    // Редактор этой темы открыт — пишем через него (иначе, закрываясь, он вернул бы свой старый текст).
    if (w && c.route.name === 'topic' && (c.route as { id: string }).id === t.id) w.append(SAMPLE_NOTE);
    else {
      updateTopic(t.id, { note: (t.note.trim() ? t.note.trimEnd() + '\n\n' : '') + SAMPLE_NOTE });
      go({ name: 'topic', id: t.id });
    }
  } else if (major === 3) {
    const t = c.noteTopic ?? ensureTopic();
    addCard({ topicId: t.id, type: 'basic', front: 'Что такое клетка?', back: 'Наименьшая единица строения и жизни всех организмов.' });
  } else if (major === 4) setSt({ learned: true });
}

const CARD_W = 440;
const CARD_H = 190; // запасная высота плашки, пока настоящую не измерили
/** Куда поставить подсказку, чтобы она не закрывала подсвеченное: снизу, сверху, справа или слева от него — где больше места. */
export function cardPlace(r: Rect | null, phone: boolean, cardH = CARD_H): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r && vh < 520) {
    // Телефон на боку: у окна сверху заголовок и крестик, снизу кнопки — плашку кладём сбоку от окна, если там есть поле.
    const side = lowSidePlace(r, vw);
    if (side) return { left: side.left, top: side.top, width: side.width, bottom: 'auto', transform: 'none' };
  }
  const bottomGap = phone ? 86 : 20; // на телефоне снизу нижняя панель
  const centerX = { left: '50%', transform: 'translateX(-50%)' };
  const atBottom = { ...centerX, top: 'auto', bottom: bottomGap };
  const atTop = { ...centerX, bottom: 'auto', top: phone ? 60 : 16 };
  if (!r) return atBottom;
  const below = vh - bottomGap - (r.y + r.h);
  const above = r.y - (phone ? 60 : 12);
  if (below >= cardH + 16) return atBottom;
  if (above >= cardH + 16) return atTop;
  const w = Math.min(CARD_W, vw - 24);
  const right = vw - (r.x + r.w);
  const top = Math.max(16, Math.min(vh - cardH - 16, r.y));
  if (right >= w + 24) return { left: r.x + r.w + 16, top, bottom: 'auto', transform: 'none' };
  if (r.x >= w + 24) return { left: r.x - w - 16, top, bottom: 'auto', transform: 'none' };
  // Места нет нигде (окно на весь экран или экран низкий, например телефон на боку) — наверх: там у окна заголовок, а внизу кнопки, их закрывать нельзя.
  return atTop;
}

/** Видимая область элемента: экран, суженный каждым родителем с прокруткой (окно «Создать» со своим списком и т. п.). */
function visibleArea(el: HTMLElement): Rect {
  let x1 = 0,
    y1 = 0,
    x2 = window.innerWidth,
    y2 = window.innerHeight;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
      const b = p.getBoundingClientRect();
      x1 = Math.max(x1, b.left);
      y1 = Math.max(y1, b.top);
      x2 = Math.min(x2, b.right);
      y2 = Math.min(y2, b.bottom);
    }
  }
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

/** Цель частично за краем экрана или окна (список длиннее окна) — прокручиваем ровно настолько, чтобы она влезла. Огромные цели не трогаем. */
export function ensureVisible(el: HTMLElement, phone: boolean) {
  const b = el.getBoundingClientRect();
  const inModal = Boolean(el.closest('.modal'));
  // На телефоне сверху полоса приложения, снизу панель вкладок; в окне они закрыты затемнением, а само окно держится у края.
  const top = phone && !inModal ? 56 : 0;
  const bottom = phone && !inModal ? 80 : 0;
  if (needsScroll({ x: b.left, y: b.top, w: b.width, h: b.height }, visibleArea(el), top, bottom)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function TutorialHost({ route, go }: { route: Route; go: (r: Route) => void }) {
  const data = useData();
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => st
  );
  // Не опрашиваем экран по таймеру: подсказка пересчитывается ровно тогда, когда на экране что-то поменялось (раз за кадр).
  const tick = useDomTick(s.active);
  const [flash, setFlash] = useState('');
  const [late, setLate] = useState<'stuck' | 'missing' | null>(null);
  const prevMajor = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const ctx = useMemo(() => context(data, route), [data, route, s.base, s.active]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = s.active ? stageOf(ctx) : null; // читает экран; пересчитывается при каждой его смене (tick)
  void tick;
  const rect = useRect(stage?.target ?? null, tick);
  const major = stage?.major ?? -1;
  const hasTarget = Boolean(stage?.target);
  const target = stage?.target ?? null;

  // Новая цель частично за краем экрана или окна — подкручиваем (один раз на цель, чтобы не спорить с пальцем человека).
  const scrolledTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (target && scrolledTo.current !== target) {
      scrolledTo.current = target;
      ensureVisible(target, isPhone());
    } else if (!target) scrolledTo.current = null;
  }, [target, tick]);
  // Настоящая высота плашки (текст бывает в две и в пять строк): по ней решаем, помещается ли она под целью или над ней.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(CARD_H);
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  });

  // Повторение открыли — запоминаем (потом можно выйти из него, шаг не откатится).
  useEffect(() => {
    if (s.active && route.name === 'review' && major === 4 && !st.learned) setSt({ learned: true });
  }, [s.active, route.name, major]);

  // Шаг вперёд — коротко отмечаем, что получилось (только настоящий переход вперёд на соседний шаг, не скачок после отката).
  useEffect(() => {
    if (!s.active) {
      prevMajor.current = 0;
      return;
    }
    if (major === prevMajor.current + 1 && !st.skipped.includes(prevMajor.current)) {
      setFlash('✓ ' + DONE_FLASH[prevMajor.current]);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(''), 1400);
    } else if (major !== prevMajor.current) setFlash('');
    prevMajor.current = major;
  }, [s.active, major]);

  // Застряли на шаге (25 с) — напомнить про «Пропустить шаг»; нужного элемента нет на экране (1,5 с) — вернуть на нужный экран, а если не помогло — тоже про «Пропустить».
  useEffect(() => {
    setLate(null);
    if (!s.active || major < 0 || major >= LAST) return;
    const t = setTimeout(() => setLate('stuck'), STUCK_MS);
    return () => clearTimeout(t);
  }, [s.active, major]);
  const topicId = stage ? workTopic(ctx)?.id : undefined;
  useEffect(() => {
    if (!s.active || major < 0 || major >= LAST || hasTarget) return;
    // Шаги, которым нужна сама подсветка (ниже «Закрой окно» и пр. — без неё можно): ждём чуть-чуть и пробуем вернуть человека на нужный экран.
    const t = setTimeout(() => {
      if ((major === 2 || major === 3) && topicId && !(route.name === 'topic' && route.id === topicId)) go({ name: 'topic', id: topicId, tab: 'note' });
      else if (major === 4 && route.name !== 'today' && route.name !== 'review' && !q('.modal')) go({ name: 'today' });
      else setLate((l) => l ?? 'missing');
    }, 1500);
    return () => clearTimeout(t);
  }, [s.active, major, hasTarget, topicId, route.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.active || !stage) return null;
  const finish = (completed: boolean) => {
    setSt({ active: false });
    setFlash('');
    if (!getData().settings.onboarded) updateSettings({ onboarded: true });
    if (completed) toast('Знакомство пройдено. Справка и знакомство — в «Профиле»');
  };
  const last = stage.major === LAST;
  const phone = isPhone();
  const low = window.innerHeight < 520; // телефон на боку: плашка сжимается до самого нужного
  const place = cardPlace(rect, phone, cardH);
  const info = stepInfo(stage.major, stage.left);
  return (
    <div className="tut" aria-live="polite">
      {rect && <div className="tut-ring" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
      <div ref={cardRef} className={'tut-card' + (phone ? ' phone' : '') + (low ? ' low' : '')} style={place} role="dialog" aria-label="Знакомство">
        <div className="tut-step">
          {last ? 'Всё готово' : `Шаг ${info.n} из ${info.total} · ${info.title}`}
          <span className="tut-bar">
            <i style={{ width: Math.max(6, info.pct) + '%' }} />
          </span>
        </div>
        {flash && <p className="tut-flash">{flash}</p>}
        <p className="tut-text">{stage.text}</p>
        {stage.hint && <p className="small muted tut-hint">{stage.hint}</p>}
        {late === 'stuck' && <p className="small muted tut-hint">Не получается или шаг не засчитывается? Нажми «Пропустить шаг» — Refrain сделает его за тебя.</p>}
        {late === 'missing' && !stage.target && <p className="small muted tut-hint">Не вижу нужной кнопки на экране. Нажми «Пропустить шаг» — Refrain сделает этот шаг за тебя.</p>}
        <div className="tut-btns">
          <span className="row gap6">
            <button className="btn ghost small" onClick={() => finish(false)}>
              Выйти
            </button>
          </span>
          {last ? (
            <button className="btn primary small" onClick={() => finish(true)}>
              <Icon name="check" size={16} /> Закончить
            </button>
          ) : (
            <button className="btn small" onClick={() => doStep(stage.major, ctx, go)} title="Refrain сделает этот шаг за тебя">
              Пропустить шаг
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
