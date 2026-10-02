// Генератор синтетических данных Мнемы (формат AppData, см. src/types.ts). Детерминированный.
import { randomUUID } from 'node:crypto';

export const TIERS = {
  t10: { S: 3, T: 10, C: 100 },
  t100: { S: 6, T: 100, C: 1500 },
  t500: { S: 10, T: 500, C: 10000 },
  t2000: { S: 15, T: 2000, C: 50000 },
  t2000lc: { S: 15, T: 2000, C: 5000 } // много тем, мало карточек — чтобы разделить влияние
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const COLORS = ['#2F8F5B', '#B4452F', '#2A5BB8', '#7A4FB5', '#C98A1B', '#1E8A8A', '#C0407A', '#5A6B7B', '#8A5A2B', '#3A7BD5', '#9A3B3B', '#4B8F2F', '#B0561E', '#2F6F8F', '#6B4FA0'];
const WORDS = ['клетка', 'ядро', 'энергия', 'уравнение', 'функция', 'угол', 'реформа', 'война', 'союз', 'глагол', 'причастие', 'сила', 'масса', 'ток', 'атом', 'ион', 'реакция', 'кислота', 'материк', 'климат', 'река', 'эпоха', 'договор', 'корень', 'степень', 'вектор', 'импульс', 'волна', 'ткань', 'орган'];

const SYL = ['ка','ро','ми','те','лу','ва','ни','со','пе','ду','хо','ла','ри','зу','бе','фо','ша','жи','цу','ги'];
// Слово из букв, разное для разных n (цифры и конец слова не используем: карта обрезает «окончание» у длинных слов).
function pseudo(n) { let w = ''; let x = n; do { w += SYL[x % SYL.length]; x = Math.floor(x / SYL.length); } while (x > 0); return w + 'ние'; }

export function makeData({ S, T, C, seed = 1, now = Date.now(), logsPerItem = 3, startedShare = 0.65, boldMean = 6, sharedShare = 0.15, treeOpenAll = false, features = {}, exams = 5 }) {
  const R = rng(seed);
  const iso = (ms) => new Date(ms).toISOString();
  const DAY = 86400000;
  const subjects = [];
  for (let i = 0; i < S; i++) subjects.push({ id: randomUUID(), name: 'Предмет ' + (i + 1), color: COLORS[i % COLORS.length], order: i + 1, createdAt: iso(now - 400 * DAY) });
  const topics = [];
  const perSubject = Math.ceil(T / S);
  const sharedPool = Math.max(8, Math.round(T / 4));
  let termSeq = 0;
  const mkNote = () => {
    const n = Math.max(0, Math.round(boldMean + (R() - 0.5) * 6));
    const parts = ['## Что это\n\n'];
    for (let k = 0; k < n; k++) {
      const shared = R() < sharedShare;
      const term = shared ? pseudo(Math.floor(R() * sharedPool)) : pseudo(1000000 + ++termSeq);
      parts.push(`**${term}** — определение номер ${k}, довольно длинное предложение, чтобы конспект был похож на настоящий. Ещё одно предложение с пояснением и примером.\n\n`);
    }
    parts.push('- пункт списка один\n- пункт списка два\n\n**Итог:** коротко.\n');
    return parts.join('');
  };
  for (let si = 0; si < S; si++) {
    const mine = [];
    const n = si === S - 1 ? T - topics.length : perSubject;
    for (let k = 0; k < n && topics.length < T; k++) {
      // ~15% корневых; остальные — внутрь случайной уже созданной темы того же предмета, глубина до 4
      let parentId;
      if (mine.length && R() > 0.15) {
        for (let tries = 0; tries < 6; tries++) {
          const p = mine[Math.floor(R() * mine.length)];
          if (p.depth < 3) { parentId = p.id; break; }
        }
      }
      const parent = parentId ? mine.find((m) => m.id === parentId) : null;
      const id = randomUUID();
      const t = { id, subjectId: subjects[si].id, name: `§${k + 1} Тема ${si + 1}-${k + 1}`, note: mkNote(), parentId, order: k + 1, createdAt: iso(now - 300 * DAY + k * 1000), updatedAt: iso(now - 10 * DAY) };
      const step = Math.max(1, Math.floor(T / Math.max(1, exams))); if (exams > 0 && topics.length % step === 0 && topics.length / step < exams) t.examDate = new Date(now + (3 + Math.floor(R() * 20)) * DAY).toISOString().slice(0, 10);
      if (R() < 0.01) t.important = true;
      topics.push(t);
      mine.push({ id, depth: parent ? parent.depth + 1 : 0 });
    }
  }
  const cards = [];
  const states = {};
  const logs = [];
  const topicIdx = topics.map((t) => t.id);
  const sf = (rate) => ({ state: 2, rate });
  for (let i = 0; i < C; i++) {
    const topicId = topicIdx[Math.min(topicIdx.length - 1, Math.floor((i / C) * topicIdx.length))];
    const r = R();
    const type = r < 0.6 ? 'basic' : r < 0.85 ? 'cloze' : r < 0.95 ? 'typing' : 'reverse';
    const id = randomUUID();
    let front, back = '';
    if (type === 'cloze') {
      const n = 1 + Math.floor(R() * 3);
      front = 'Фраза номер ' + i + ': ' + Array.from({ length: n }, (_, j) => `{{пропуск${j}}} и текст`).join(' ');
    } else front = 'Вопрос номер ' + i + ' про тему, достаточно длинный?';
    if (type !== 'cloze') back = type === 'typing' ? 'ответ|вариант' : 'Ответ на вопрос номер ' + i + ', тоже достаточно развёрнутый.';
    const card = { id, topicId, type, front, back, createdAt: iso(now - 200 * DAY), updatedAt: iso(now - 200 * DAY) };
    cards.push(card);
    const ords = type === 'reverse' ? [0, 1] : type === 'cloze' ? Array.from({ length: (front.match(/\{\{/g) || []).length }, (_, j) => j) : [0];
    for (const ord of ords) {
      if (R() > startedShare) continue;
      const key = id + ':' + ord;
      const stab = Math.exp(R() * 5); // 1..150 дней
      const lapses = R() < 0.1 ? 2 + Math.floor(R() * 4) : R() < 0.25 ? 1 : 0;
      const lastDaysAgo = Math.floor(R() * 60);
      const sched = Math.max(1, Math.round(stab));
      const due = now - lastDaysAgo * DAY + sched * DAY;
      const reps = 1 + Math.floor(R() * 8);
      const state = R() < 0.05 ? 3 : R() < 0.04 ? 1 : 2;
      states[key] = { due: iso(due), stability: stab, difficulty: 1 + R() * 9, elapsed_days: sched, scheduled_days: sched, learning_steps: 0, reps, lapses, state, last_review: iso(now - lastDaysAgo * DAY) };
      const nl = Math.max(1, Math.round(logsPerItem + (R() - 0.5) * 3));
      for (let q = 0; q < nl; q++) {
        const at = now - (lastDaysAgo + (nl - 1 - q) * 5) * DAY - Math.floor(R() * 3600_000);
        logs.push({ key, cardId: id, topicId, rating: R() < 0.15 ? 1 : R() < 0.5 ? 3 : R() < 0.8 ? 4 : 2, prevState: q === 0 ? 0 : 2, at: iso(at), ms: 2000 + Math.floor(R() * 12000) });
      }
    }
  }
  logs.sort((a, b) => (a.at < b.at ? -1 : 1));
  const treeOpen = treeOpenAll ? [...subjects.map((s) => s.id), ...topics.filter((t) => topics.some((x) => x.parentId === t.id)).map((t) => t.id)] : [];
  const data = {
    version: 1, folders: [], homework: [], subjects, topics, cards, states, logs, tests: [], deleted: {}, deviceId: 'perf1',
    settings: { onboarded: true, treeOpen, features: { map: true, garden: true, awards: true, weekly: true, ...features } }
  };
  return data;
}

export function sizeReport(d) {
  const s = (x) => JSON.stringify(x).length;
  return { total: s(d), subjects: s(d.subjects), topics: s(d.topics), cards: s(d.cards), states: s(d.states), logs: s(d.logs), nStates: Object.keys(d.states).length, nLogs: d.logs.length };
}
