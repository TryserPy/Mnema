// Сад знаний: каждая тема — растение. Чем лучше выучена тема, тем выше оно растёт: семечко → росток →
// саженец → бутон → цветок → пышный куст → золотое растение. Если карточки давно ждут — вянет; полил (повторил) —
// снова зелёное. На растение можно нажать: узнать, сколько осталось до следующей стадии, полить или погладить.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { buildQueue, topicMastery } from '../srs';
import { childTopics, sortedSubjects } from '../store';
import type { AppData, Route } from '../types';
import { Icon, plural, selHow } from './ui';

type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface Plant {
  id: string;
  name: string;
  subjectId: string;
  color: string;
  stage: Stage;
  thirsty: boolean;
  pct: number;
  due: number;
  total: number;
  learned: number;
  need: number; // сколько ещё карточек выучить до следующей стадии
}

export const STAGE_NAME = ['Семечко', 'Проклюнулся', 'Росток', 'Саженец', 'Бутон', 'Цветёт', 'Пышный куст', 'Золотое растение'];
// Доля выученных карточек, с которой начинается стадия (0 и 1 — «ещё не начата» и «начата»).
const TH = [0, 0, 0.1, 0.25, 0.4, 0.6, 0.8, 0.95];

function stageOf(total: number, learned: number, started: number): Stage {
  if (total === 0 || started === 0) return 0;
  const p = learned / total;
  let s = 1;
  for (let i = 2; i < TH.length; i++) if (p >= TH[i]) s = i;
  if (s === 7 && total < 3) s = 6;
  return s as Stage;
}

function needFor(p: { stage: Stage; total: number; learned: number }): number {
  if (p.stage >= 7 || p.total === 0) return 0;
  if (p.stage === 0) return 0;
  const next = TH[p.stage + 1];
  return Math.max(1, Math.ceil(next * p.total) - p.learned);
}

const LEAF = '#4E9A5B';
const LEAF2 = '#3C8750';
const DRY = '#BCA759';
const DRY2 = '#A28F45';

/** Лист: основание в (0,0), смотрит вправо; дальше его поворачивают и масштабируют. */
const LEAF_D = 'M0 0 C 6 -7, 16 -8, 22 -2 C 15 3, 6 4, 0 0 Z';

const PET_SAY = ['Приятно! 💚', 'Растению нравится 🌱', 'Мур… то есть шелест 🍃', 'Ещё! 💚', 'Растёт с удовольствием ✨'];

/** Поглаживание: ладошка проводит по растению, вылетают сердечки и искорки. */
function PetEffect() {
  return (
    <span className="pet-fx-layer" aria-hidden="true">
      <span className="pet-hand">🖐️</span>
      <span className="hearts">
        <i>♥</i>
        <i>♥</i>
        <i>♥</i>
        <i>♥</i>
        <i>♥</i>
      </span>
      <span className="sparks">
        <i>✦</i>
        <i>✦</i>
        <i>✦</i>
      </span>
    </span>
  );
}

function Flower({ x, y, r, petals, color, dry, delay = 0 }: { x: number; y: number; r: number; petals: number; color: string; dry: boolean; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="bloom" style={{ animationDelay: delay + 's' }}>
        {Array.from({ length: petals }, (_, k) => (
          <ellipse key={k} cx="0" cy={-r * 0.95} rx={r * 0.55} ry={r} fill={color} opacity={dry ? 0.5 : 0.95} transform={`rotate(${(360 / petals) * k})`} />
        ))}
        <circle r={r * 0.55} fill={dry ? '#D6B85A' : '#F6C945'} />
        <circle r={r * 0.22} cx={-r * 0.15} cy={-r * 0.15} fill="#fff" opacity="0.45" />
      </g>
    </g>
  );
}

export function PlantSvg({ stage, thirsty, color, seed = 0 }: { stage: Stage; thirsty: boolean; color: string; seed?: number }) {
  const dry = thirsty;
  const leaf = dry ? DRY : LEAF;
  const leaf2 = dry ? DRY2 : LEAF2;
  const H = [0, 12, 24, 36, 48, 58, 66, 72][stage];
  const bend = dry ? 10 : (seed % 3) - 1;
  const top = { x: 50 + bend * 0.9, y: 106 - H * (dry ? 0.85 : 1) };
  const at = (t: number) => {
    // точка на стебле (квадратичная кривая)
    const cx = 50 + bend * 0.2;
    const cy = 106 - H * 0.55;
    const x = (1 - t) * (1 - t) * 50 + 2 * (1 - t) * t * cx + t * t * top.x;
    const y = (1 - t) * (1 - t) * 106 + 2 * (1 - t) * t * cy + t * t * top.y;
    return { x, y };
  };
  const pairs = [0, 0, 1, 2, 3, 3, 4, 4][stage];
  const leafSize = [0, 0.6, 0.8, 1, 1.1, 1.15, 1.25, 1.3][stage];
  const leaves: ReactElement[] = [];
  for (let k = 0; k < pairs; k++) {
    const t = 0.25 + (k / Math.max(1, pairs)) * 0.6;
    const p = at(t);
    const sc = leafSize * (1 - k * 0.08);
    const droop = dry ? 30 : 0;
    leaves.push(<path key={'l' + k} d={LEAF_D} fill={k % 2 ? leaf2 : leaf} transform={`translate(${p.x} ${p.y}) rotate(${-25 + droop}) scale(${sc})`} />);
    leaves.push(<path key={'r' + k} d={LEAF_D} fill={k % 2 ? leaf : leaf2} transform={`translate(${p.x} ${p.y}) scale(-1 1) rotate(${-20 + droop}) scale(${sc})`} />);
  }
  return (
    <svg viewBox="0 0 100 122" className={'plant s' + stage + (dry ? ' thirsty' : '')} aria-hidden="true">
      <ellipse cx="50" cy="110" rx="30" ry="7" className="soil" />
      <ellipse cx="50" cy="108" rx="18" ry="3.5" className="soil-top" />
      {stage === 0 && (
        <g className="seed">
          <ellipse cx="50" cy="104" rx="6.5" ry="4.5" fill="#8B6A43" />
          <path d="M46 103 q 4 -2 8 0" stroke="#6E5233" strokeWidth="1.2" fill="none" />
        </g>
      )}
      {stage >= 1 && (
        <g className="sway" style={{ animationDelay: `${(seed % 7) * -0.6}s` }}>
          <path d={`M50 106 Q ${50 + bend * 0.2} ${106 - H * 0.55} ${top.x} ${top.y}`} stroke={leaf2} strokeWidth={stage >= 6 ? 4.2 : stage >= 3 ? 3.4 : 2.6} fill="none" strokeLinecap="round" />
          {leaves}
          {stage === 1 && (
            <>
              <path d={LEAF_D} fill={leaf} transform={`translate(${top.x} ${top.y}) rotate(-35) scale(0.42)`} />
              <path d={LEAF_D} fill={leaf2} transform={`translate(${top.x} ${top.y}) scale(-1 1) rotate(-35) scale(0.42)`} />
            </>
          )}
          {(stage === 2 || stage === 3) && <path d={LEAF_D} fill={leaf} transform={`translate(${top.x} ${top.y}) rotate(-80) scale(${stage === 2 ? 0.5 : 0.62})`} />}
          {stage === 4 && (
            <g transform={`translate(${top.x} ${top.y})`}>
              <g className="bloom">
                <ellipse cx="0" cy="-7" rx="5" ry="8.5" fill={color} opacity={dry ? 0.55 : 1} />
                <path d="M-5 -2 q 5 -7 10 0 q -5 3 -10 0z" fill={leaf2} />
              </g>
            </g>
          )}
          {stage === 5 && <Flower x={top.x} y={top.y - 4} r={7.5} petals={5} color={color} dry={dry} />}
          {stage >= 6 && (
            <>
              <path d={`M${at(0.55).x} ${at(0.55).y} q -12 -6 -18 -16`} stroke={leaf2} strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d={`M${at(0.45).x} ${at(0.45).y} q 12 -6 18 -14`} stroke={leaf2} strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <Flower x={at(0.55).x - 18} y={at(0.55).y - 17} r={5} petals={5} color={color} dry={dry} delay={0.15} />
              <Flower x={at(0.45).x + 18} y={at(0.45).y - 15} r={5} petals={5} color={color} dry={dry} delay={0.3} />
              <Flower x={top.x} y={top.y - 5} r={stage === 7 ? 10 : 8.5} petals={stage === 7 ? 8 : 6} color={color} dry={dry} />
            </>
          )}
          {stage === 7 && !dry && (
            <g className="sparkles">
              {[
                [22, 30, 0],
                [78, 26, 0.7],
                [30, 60, 1.4],
                [74, 58, 2.1]
              ].map(([x, y, d]) => (
                <path key={x} d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3Z" fill="#F6C945" transform={`translate(${x} ${y})`} style={{ animationDelay: d + 's' }} />
              ))}
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

function skyOf(h: number): 'morning' | 'day' | 'evening' | 'night' {
  if (h >= 6 && h < 10) return 'morning';
  if (h >= 10 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

const SEEN_KEY = 'mnema-garden-seen';

export function Garden({ data, go }: { data: AppData; go: (r: Route) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [pet, setPet] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const beds = useMemo(() => {
    const now = new Date();
    const queue = buildQueue(data, now, {}, () => 0.5);
    const dueByTopic = new Map<string, number>();
    for (const it of queue) if (!it.isNew) dueByTopic.set(it.topicId, (dueByTopic.get(it.topicId) ?? 0) + 1);
    return sortedSubjects(data).map((s) => {
      const topics: Plant[] = [];
      const walk = (parent?: string) => {
        for (const t of childTopics(data, s.id, parent)) {
          const m = topicMastery(data, t.id);
          const due = dueByTopic.get(t.id) ?? 0;
          // «Хочет пить»: много карточек ждут повторения или тема забывается
          const thirsty = m.started > 0 && (due >= Math.max(5, m.total * 0.4) || m.struggling >= Math.max(3, m.total * 0.3));
          const stage = stageOf(m.total, m.learned, m.started);
          const p: Plant = { id: t.id, name: t.name, subjectId: s.id, color: s.color, stage, thirsty, pct: m.total ? Math.round((m.learned / m.total) * 100) : 0, due, total: m.total, learned: m.learned, need: 0 };
          p.need = needFor(p);
          topics.push(p);
          walk(t.id);
        }
      };
      walk();
      return { s, topics };
    });
  }, [data]);

  // Какие растения подросли с прошлого раза — у них праздник.
  const grown = useRef<Set<string>>(new Set());
  const all = beds.flatMap((b) => b.topics);
  useEffect(() => {
    let seen: Record<string, number> = {};
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    } catch {
      /* нет хранилища */
    }
    const next: Record<string, number> = {};
    for (const p of all) {
      if (seen[p.id] !== undefined && p.stage > seen[p.id]) grown.current.add(p.id);
      next[p.id] = p.stage;
    }
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* нет хранилища */
    }
  }, [all.map((p) => p.id + p.stage).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (all.length === 0) return <div className="empty">Здесь вырастет сад: каждая тема — растение. Добавь тему и начни учить.</div>;
  const blooming = all.filter((p) => p.stage >= 5).length;
  const thirsty = all.filter((p) => p.thirsty);
  const golden = all.filter((p) => p.stage === 7).length;
  const selected = all.find((p) => p.id === sel) ?? null;
  const sky = skyOf(new Date().getHours());
  const shownBeds = beds.filter((b) => b.topics.length && (!filter || b.s.id === filter));

  return (
    <div className="garden-wrap">
      <div className="garden-sum">
        <div className="gs-item">
          <strong>{all.length}</strong>
          <span>{plural(all.length, 'растение', 'растения', 'растений')}</span>
        </div>
        <div className="gs-item">
          <strong>{blooming}</strong>
          <span>цветут</span>
        </div>
        {golden > 0 && (
          <div className="gs-item gold">
            <strong>{golden}</strong>
            <span>золотых</span>
          </div>
        )}
        <div className={'gs-item' + (thirsty.length ? ' thirsty' : '')}>
          <strong>{thirsty.length}</strong>
          <span>хотят пить</span>
        </div>
        {thirsty.length > 0 && (
          <button className="btn small primary gs-water" onClick={() => go({ name: 'review' })}>
            <Icon name="drop" size={16} /> Полить всё
          </button>
        )}
      </div>
      {beds.filter((b) => b.topics.length).length > 1 && (
        <div className="hw-filter">
          <button className={'hw-fchip' + (filter === null ? ' on' : '')} onClick={() => setFilter(null)}>
            Весь сад
          </button>
          {beds
            .filter((b) => b.topics.length)
            .map(({ s }) => (
              <button key={s.id} className={'hw-fchip' + (filter === s.id ? ' on' : '')} onClick={() => setFilter(filter === s.id ? null : s.id)}>
                <span className="dot" style={{ background: s.color }} /> {s.name}
              </button>
            ))}
        </div>
      )}
      <p className="small muted garden-hint">Нажми на растение, чтобы узнать, как оно растёт, полить или погладить. Растение поднимается от семечка до золотого, когда карточки темы запоминаются надолго, а если долго не повторять — вянет.</p>
      <div className={'garden-scene sky-' + sky}>
        {sky === 'night' && <div className="stars" aria-hidden="true" />}
        <div className={'sun sun-' + sky} aria-hidden="true" />
        {shownBeds.map(({ s, topics }) => (
          <div key={s.id} className="bed">
            <div className="bed-name">
              <span className="dot" style={{ background: s.color }} /> {s.name}
              <span className="bed-count">
                {topics.filter((p) => p.stage >= 5).length}/{topics.length} цветут
              </span>
            </div>
            <div className="bed-plants">
              {topics.map((p, i) => (
                <button
                  key={p.id}
                  className={'plant-btn' + (sel === p.id ? ' sel' : '') + (grown.current.has(p.id) ? ' grown' : '')}
                  onClick={() => {
                    if (sel === p.id) setPet((x) => x + 1);
                    else setSel(p.id);
                  }}
                  aria-label={`${p.name}: ${STAGE_NAME[p.stage]}, выучено ${p.pct}%${p.thirsty ? ', хочет пить' : ''}`}
                  aria-pressed={sel === p.id}
                  title={p.name}
                >
                  <span className={'plant-box pet-fx' + (sel === p.id && pet > 0 ? ' petting' : '')} key={sel === p.id ? 'pet' + pet : 'p'}>
                    <PlantSvg stage={p.stage} thirsty={p.thirsty} color={s.color} seed={i} />
                    {sel === p.id && pet > 0 && <PetEffect />}
                    {p.thirsty && <span className="drop-badge">💧</span>}
                    {grown.current.has(p.id) && <span className="grew">подрос!</span>}
                  </span>
                  <span className="plant-name">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {selected && (
      <div className="garden-detail on" key={selected.id}>
        {(
          <>
            <div className="gd-plant pet-fx" key={'gd' + pet}>
              <span className={pet > 0 ? 'pet-body petting' : 'pet-body'}>
                <PlantSvg stage={selected.stage} thirsty={selected.thirsty} color={selected.color} />
              </span>
              {pet > 0 && <PetEffect />}
            </div>
            <div className="grow stack gap6 gd-text">
              <strong className="gd-name">{selected.name}</strong>
              <span className="gd-stage">
                {STAGE_NAME[selected.stage]}
                {selected.thirsty ? ' · хочет пить' : ''}
              </span>
              <div className="gd-bar" title={`Выучено ${selected.pct}%`}>
                <span style={{ width: selected.pct + '%', background: selected.color }} />
                {TH.slice(2).map((t) => (
                  <i key={t} style={{ left: t * 100 + '%' }} />
                ))}
              </div>
              <span className="small muted">
                {selected.total === 0
                  ? `В теме нет карточек — посади их: в конспекте ${selHow('В карточку')}.`
                  : selected.stage === 0
                    ? 'Семечко проснётся после первого повторения.'
                    : selected.stage === 7
                      ? 'Тема выучена почти полностью. Повторяй, когда попросит, — и она не завянет.'
                      : `До стадии «${STAGE_NAME[selected.stage + 1]}» — выучить ещё ${selected.need} ${plural(selected.need, 'карточку', 'карточки', 'карточек')}.`}
              </span>
              <div className="row gap8 wrap">
                {selected.due > 0 || (selected.total > 0 && selected.stage === 0) ? (
                  <button className="btn primary small" onClick={() => go({ name: 'review', topicId: selected.id })}>
                    <Icon name="drop" size={16} /> {selected.stage === 0 ? 'Посадить (начать учить)' : `Полить · ${selected.due}`}
                  </button>
                ) : null}
                <button className="btn small" onClick={() => go({ name: 'topic', id: selected.id })}>
                  Открыть тему
                </button>
                <button className="btn small ghost" onClick={() => setPet((x) => x + 1)} title="Растениям приятно">
                  ♥ Погладить
                </button>
                {pet > 0 && (
                  <span className="pet-say small" key={'say' + pet}>
                    {PET_SAY[pet % PET_SAY.length]}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
        <button className="icon-btn small gd-close" aria-label="Закрыть" onClick={() => setSel(null)}>
          <Icon name="x" size={16} />
        </button>
      </div>
      )}
    </div>
  );
}
