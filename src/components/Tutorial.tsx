// Знакомство «как в играх»: подсвечивает нужное место, а человек делает всё сам — создаёт предмет, тему, пишет конспект, делает карточку.
// Шаг определяется по тому, что есть на самом деле (есть ли новый предмет, тема, конспект, карточка; открыто ли окно), а не по счётчику:
// закрыл окно, удалил созданное, ушёл на другой экран — подсказка сама возвращается на нужный шаг.
// «Пропустить шаг» делает шаг за человека (создаёт предмет, тему, пишет пример конспекта, карточку); «Выйти» — закончить.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { addCard, addSubject, addTopic, getData, updateSettings, updateTopic, useData } from '../store';
import { noteWriter } from '../noteRegistry';
import type { AppData, Route, Topic } from '../types';
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

/** Начать интерактивное знакомство (из «Знакомства», «Справки», «О Мнеме»). */
export function startTutorial() {
  const d = getData();
  setSt({ active: true, skipped: [], learned: false, base: { subjects: new Set(d.subjects.map((x) => x.id)), topics: new Set(d.topics.map((x) => x.id)), cards: new Set(d.cards.map((x) => x.id)) } });
}

const q = (sel: string): HTMLElement | null => document.querySelector<HTMLElement>(sel);
const visible = (e: HTMLElement) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
const byText = (sel: string, text: string): HTMLElement | null => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => visible(e) && (e.textContent ?? '').includes(text)) ?? null;
const createBtn = () => q('.tab-plus') ?? q('.sidebar .create-btn');
const menuOpen = () => Boolean(q('.modal .create-item'));
const dialogTitle = () => q('.modal h2')?.textContent ?? '';
const anyModal = () => Boolean(q('.modal'));

/** Крупные шаги — для полоски «Шаг N из 6». */
const MAJORS = ['Предмет', 'Тема', 'Конспект', 'Карточка', 'Повторение', 'Готово'];
const DONE_FLASH = ['Предмет создан', 'Тема создана', 'Конспект написан', 'Карточка готова', 'Повторение открыто'];

interface Ctx {
  data: AppData;
  route: Route;
  newSubjects: { id: string; name: string }[];
  newTopics: Topic[];
  noteTopic?: Topic;
  cardsNew: number;
}

function context(data: AppData, route: Route): Ctx {
  const newSubjects = data.subjects.filter((s) => !st.base.subjects.has(s.id));
  const newTopics = data.topics.filter((t) => !t.kind && !st.base.topics.has(t.id));
  return { data, route, newSubjects, newTopics, noteTopic: newTopics.find((t) => t.note.trim().length >= 25), cardsNew: data.cards.filter((c) => !st.base.cards.has(c.id)).length };
}

/** Какой крупный шаг сейчас: первый, который не сделан (и не пропущен). */
function currentMajor(c: Ctx): number {
  const sk = st.skipped;
  if (!sk.includes(0) && c.newSubjects.length === 0) return 0;
  if (!sk.includes(1) && c.newTopics.length === 0) return 1;
  if (!sk.includes(2) && !c.noteTopic) return 2;
  if (!sk.includes(3) && c.cardsNew === 0) return 3;
  if (!sk.includes(4) && !st.learned) return 4;
  return 5;
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
    (subject ? (byText('.main .know-tile', subject.name) ?? byText('.sidebar .tree-row.subject .tree-label', subject.name)) : null) ??
    byText('.tab', 'Знания') ??
    byText('.sidebar .nav-item', 'Знания')
  );
}

interface Stage {
  major: number;
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
      if (dialogTitle() === 'Новый предмет') return { major, text: 'Назови предмет — например, «Биология» — и нажми «Создать».', target: q('.modal') };
      if (menuOpen()) return { major, text: 'Выбери «Новый предмет».', target: byText('.modal .create-item', 'Новый предмет') };
      return { major, text: 'Нажми «Создать» — отсюда создаётся всё.', target: createBtn() };
    case 1:
      if (dialogTitle() === 'Новая тема') return { major, text: 'Назови тему — например, «§1 Клетка» — и нажми «Создать».', target: q('.modal') };
      if (menuOpen()) return { major, text: 'Выбери «Новая тема».', target: byText('.modal .create-item', 'Новая тема') };
      return { major, text: 'Теперь тема — один параграф или раздел. Нажми «Создать» и выбери «Новая тема».', target: createBtn() };
    case 2:
      if (!inOurTopic) return topic ? { major, text: <>Открой свою тему «{topic.name}» — в ней пишется конспект.</>, target: anyModal() ? q('.modal') : openTopicTarget(c, topic) } : { major, text: 'Открой любую тему — в ней пишется конспект.', target: byText('.tab', 'Знания') ?? byText('.sidebar .nav-item', 'Знания') };
      if (!q('.ProseMirror')) return { major, text: 'Открой вкладку «Конспект».', target: byText('.topic-tabs [role="tab"], .topic-tabs button', 'Конспект') };
      return { major, text: 'Напиши в конспекте пару предложений своими словами — главное из темы.', hint: 'Не переписывай учебник: своими словами запоминается лучше.', target: q('.ProseMirror') };
    case 3:
      if (anyModal()) return { major, text: 'Заполни вопрос и ответ и нажми «Сохранить».', target: q('.modal') };
      if (!inOurTopic) return topic ? { major, text: <>Вернись в тему «{topic.name}» — карточку делают из конспекта.</>, target: openTopicTarget(c, topic) } : { major, text: 'Открой тему с конспектом.', target: byText('.tab', 'Знания') };
      if (!q('.ProseMirror')) return { major, text: 'Открой вкладку «Конспект».', target: byText('.topic-tabs [role="tab"], .topic-tabs button', 'Конспект') };
      return { major, text: <>Сделай карточку: {selHow('В карточку')}.</>, hint: 'Одна карточка — один факт.', target: q('.ProseMirror') };
    case 4:
      if (anyModal()) return { major, text: 'Закрой это окно — и вернёмся к повторению.', target: q('.modal') };
      return { major, text: 'Теперь повторение. Вернись на «Сегодня» и нажми «Учиться».', target: c.route.name === 'today' ? q('.hero-btn') : (byText('.tab', 'Учусь') ?? byText('.sidebar .nav-item', 'Сегодня')) };
    default:
      return { major: 5, text: 'Готово! Так выглядит повторение: сначала вспомни ответ сам, потом открой и честно оцени. Мнема сама решит, когда показать карточку снова.', target: null };
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CARD_W = 440;
const CARD_H = 190;
/** Куда поставить подсказку, чтобы она не закрывала подсвеченное: снизу, сверху, справа или слева от него — где больше места. */
function cardPlace(r: Rect | null, phone: boolean): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bottomGap = phone ? 86 : 20; // на телефоне снизу нижняя панель
  const centerX = { left: '50%', transform: 'translateX(-50%)' };
  const atBottom = { ...centerX, top: 'auto', bottom: bottomGap };
  const atTop = { ...centerX, bottom: 'auto', top: phone ? 60 : 16 };
  if (!r) return atBottom;
  const below = vh - bottomGap - (r.y + r.h);
  const above = r.y - (phone ? 60 : 12);
  if (below >= CARD_H + 16) return atBottom;
  if (above >= CARD_H + 16) return atTop;
  const w = Math.min(CARD_W, vw - 24);
  const right = vw - (r.x + r.w);
  const top = Math.max(16, Math.min(vh - CARD_H - 16, r.y));
  if (right >= w + 24) return { left: r.x + r.w + 16, top, bottom: 'auto', transform: 'none' };
  if (r.x >= w + 24) return { left: r.x - w - 16, top, bottom: 'auto', transform: 'none' };
  // Места нет нигде (окно на весь экран) — туда, где свободнее, пусть и поверх края.
  return below >= above ? atBottom : atTop;
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
  const [tick, setTick] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [flash, setFlash] = useState('');
  const prevMajor = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Раз в четверть секунды смотрим на экран: окно закрыли? тему удалили? куда подсвечивать?
  useEffect(() => {
    if (!s.active) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [s.active]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const ctx = context(data, route);
  const stage = s.active ? stageOf(ctx) : null;

  useEffect(() => {
    if (!s.active || !stage) return;
    // Повторение открыли — запоминаем (потом можно выйти из него, шаг не откатится).
    if (route.name === 'review' && stage.major === 4 && !st.learned) setSt({ learned: true });
    // Шаг вперёд — коротко отмечаем, что получилось.
    if (stage.major > prevMajor.current && !st.skipped.includes(prevMajor.current)) {
      setFlash('✓ ' + DONE_FLASH[prevMajor.current]);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(''), 1400);
    }
    prevMajor.current = stage.major;
    const el = stage.target;
    if (el) {
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height };
      setRect((o) => (o && Math.abs(o.x - next.x) < 1 && Math.abs(o.y - next.y) < 1 && Math.abs(o.w - next.w) < 1 && Math.abs(o.h - next.h) < 1 ? o : next));
    } else setRect(null);
  }, [tick, data, route, s]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.active || !stage) return null;
  const finish = (completed: boolean) => {
    setSt({ active: false });
    setRect(null);
    setFlash('');
    if (!getData().settings.onboarded) updateSettings({ onboarded: true });
    if (completed) toast('Знакомство пройдено. Справка и знакомство — в «Профиле»');
  };
  const last = stage.major === 5;
  const phone = window.innerWidth < 720;
  const place = cardPlace(rect, phone);
  return (
    <div className="tut" aria-live="polite">
      {rect && <div className="tut-ring" style={{ left: rect.x - 6, top: rect.y - 6, width: rect.w + 12, height: rect.h + 12 }} />}
      <div className={'tut-card' + (phone ? ' phone' : '')} style={place} role="dialog" aria-label="Знакомство">
        <div className="tut-step">
          Шаг {stage.major + 1} из {MAJORS.length} · {MAJORS[stage.major]}
          <span className="tut-bar">
            <i style={{ width: ((stage.major + 1) / MAJORS.length) * 100 + '%' }} />
          </span>
        </div>
        {flash && <p className="tut-flash">{flash}</p>}
        <p className="tut-text">{stage.text}</p>
        {stage.hint && <p className="small muted tut-hint">{stage.hint}</p>}
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
            <button className="btn small" onClick={() => doStep(stage.major, ctx, go)} title="Мнема сделает этот шаг за тебя">
              Пропустить шаг
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
