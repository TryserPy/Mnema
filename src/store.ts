// Хранилище данных: состояние в памяти + сохранение в файл (Electron) или localStorage (браузер).
import { useSyncExternalStore } from 'react';
import { bridgeKey } from './platform/bridgeKey';
import type { Grade } from 'ts-fsrs';
import { DEFAULT_HIGHLIGHT } from './important';
import { DEFAULT_ACCENT, DEFAULT_LOOK, migrateLook } from './themes';
import { emit } from './plugins/bus';
import { gradeItem, itemKey, itemOrds } from './srs';
import type { AppData, Card, CardType, Poem, Confidence, FeatureId, Folder, Homework, ItemState, ListKind, ListMode, ReviewLogEntry, Settings, StudyList, Subject, TestResult, Topic } from './types';

export type AiProvider = 'anthropic' | 'gemini' | 'local' | `custom:${string}`;
export type AiFormat = 'openai' | 'anthropic' | 'gemini';
export type AiAuth = 'bearer' | 'api-key' | 'x-api-key' | 'none';

export interface CustomAi {
  id: string;
  name: string;
  format: AiFormat;
  baseUrl: string;
  model: string;
  vision: boolean;
  auth: AiAuth;
  headers: string;
  speechModel?: string;
  hasKey: boolean;
}

export interface AiModelInfo {
  id: string;
  vision?: boolean;
  free?: boolean;
}

export type CustomAiDraft = Omit<CustomAi, 'id' | 'hasKey'> & { id?: string; key?: string; select?: boolean };

export interface AiConfig {
  provider: AiProvider;
  visionProvider: AiProvider | '';
  speechProvider: AiProvider | '';
  models: Record<'anthropic' | 'gemini' | 'local', string>;
  endpoint: string;
  custom: CustomAi[];
  hasKey: { anthropic: boolean; gemini: boolean };
}

export interface AiRequest {
  system?: string;
  text: string;
  image?: { mime: string; data: string };
  maxTokens?: number;
}

export interface Vault {
  root: string;
  name: string;
  files: string[];
}

declare global {
  interface Window {
    mnemaApi?: {
      load: () => string | null;
      save: (json: string) => Promise<boolean>;
      saveSync: (json: string) => boolean;
      openDataFolder: () => Promise<string>;
      obsidianPick?: () => Promise<Vault | null>;
      obsidianRead?: (rel: string) => Promise<{ text: string; images: Record<string, string> }>;
      aiGetConfig?: () => Promise<AiConfig>;
      aiSetConfig?: (patch: Partial<Omit<AiConfig, 'hasKey' | 'custom'>> & { key?: { provider: 'anthropic' | 'gemini'; value: string } }) => Promise<AiConfig>;
      aiSaveCustom?: (draft: CustomAiDraft) => Promise<{ ok: true; id: string; config: AiConfig } | { ok: false; error: string }>;
      aiDeleteCustom?: (id: string) => Promise<AiConfig>;
      aiProbe?: (q: { draft?: CustomAiDraft; provider?: AiProvider; kind?: 'models' | 'test'; checkVision?: boolean }) => Promise<{ ok: true; text?: string; models?: AiModelInfo[]; vision?: boolean; keyInfo?: string } | { ok: false; error: string }>;
      aiAsk?: (req: AiRequest) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
      aiTranscribe?: (req: { data: string; mime: string; lang?: string }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
      speechStart?: (lang: string) => { ok: boolean; error?: string } | undefined;
      speechStop?: () => void;
      speak?: (text: string, lang: string) => void;
      print?: () => void;
      secretGet?: (name: string) => Promise<string>;
      secretSet?: (name: string, value: string) => Promise<boolean>;
      obsidianExport?: (files: { path: string; content: string; base64?: boolean }[]) => Promise<{ ok: boolean; canceled?: boolean; folder?: string; written?: number; zip?: boolean }>;
      saveFile?: (name: string, base64: string, mime: string) => Promise<boolean>;
      aiLocalModels?: () => Promise<{ ok: true; models: string[] } | { ok: false; error: string }>;
      ocrRecognize?: (bytes: Uint8Array) => Promise<{ ok: true; lines: unknown[] } | { ok: false; error: string }>;
      scheduleNotifications?: (list: { id: string; at: number; title: string; body: string; open: string }[]) => void;
      setWidget?: (json: string) => void;
      updateCheck?: (src: { owner: string; repo: string }) => Promise<{ ok: boolean; error?: string; current?: string; latest?: string | null; available?: boolean; notes?: string }>;
      /** Скачать обновление. На телефоне — APK по ссылке из выпуска (url), на компьютере url не нужен. */
      updateDownload?: (url?: string) => Promise<{ ok: boolean; error?: string }>;
      /** Поставить скачанное. На телефоне может попросить разрешение «ставить приложения» (permission). */
      updateInstall?: () => Promise<boolean | { ok: boolean; permission?: boolean; error?: string }>;
      onUpdateEvent?: (cb: (e: { type: 'progress'; percent: number } | { type: 'ready'; version: string } | { type: 'error'; message: string }) => void) => () => void;
      /** Значок приложения на рабочем столе телефона (под тему). */
      setAppIcon?: (name: string) => void;
      onNotifyOpen?: (cb: (what: string) => void) => () => void;
      notifyPermission?: () => Promise<boolean>;
      trayState?: (s: { enabled: boolean; due: number; reminder: string | null; hotkey: boolean; accelerator?: string; closeToTray: boolean; autostart: boolean }) => void;
      onMiniStart?: (cb: () => void) => () => void;
      miniEnd?: () => void;
      syncStart?: () => Promise<{ ok: true; token: string; port: number; hosts: string[] } | { ok: false; error: string }>;
      syncStop?: () => Promise<boolean>;
      onSyncIncoming?: (cb: (data: unknown) => Promise<{ data: AppData; report: unknown }>) => () => void;
      onSyncDone?: (cb: (msg: { device: string; report: import('./sync').MergeReport }) => void) => () => void;
      http?: (r: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number }) => Promise<{ status: number; text: string }>;
      platform: string;
    };
  }
}

const LS_KEY = 'mnema-data';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: DEFAULT_ACCENT,
  fontScale: 1,
  density: 'normal',
  look: DEFAULT_LOOK,
  plugins: [],
  pluginsSafe: true,
  pluginData: {},
  homeworkRemind: { on: true, time: '18:00', when: 'dayBefore' },
  lessonsRemind: { on: true, time: '19:30' },
  update: { owner: '', repo: 'mnema', auto: true },
  cardTemplates: [],
  modsOn: [],
  customMods: [],
  userCss: '',
  awardsSeen: [],
  motion: 'all',
  motionOff: [],
  retention: 0.9,
  newPerDay: 15,
  maxReviews: 200,
  dayStartHour: 4,
  showIntervals: true,
  simpleButtons: false,
  askConfidence: false,
  tips: true,
  dismissedTips: [],
  features: { leeches: true, test: true, focus: false, schedule: false, obsidian: false, confidence: false, tips: true, ai: false, handwriting: false, map: false, tray: false, voice: false, lists: true, rules: true, weekly: true, awards: true, garden: true, mods: false, homework: true, why: true, poems: true },
  schedule: {},
  focusMinutes: 25,
  breakMinutes: 5,
  leechThreshold: 5,
  onboarded: false,
  reminder: '18:00',
  trayHotkey: true,
  closeToTray: false,
  autostart: false,
  sidebarWidth: 248,
  sidebarCollapsed: false,
  treeOpen: [],
  keys: {},
  graph: { repel: 1, linkDistance: 1, nodeSize: 1, labels: 'auto', showTerms: true },
  highlight: DEFAULT_HIGHLIGHT,
  textbook: { mode: 'auto', keepPhotos: true },
  cloud: null
};

export function emptyData(): AppData {
  return { version: 1, folders: [], homework: [], subjects: [], topics: [], cards: [], states: {}, logs: [], tests: [], settings: { ...DEFAULT_SETTINGS, features: { ...DEFAULT_SETTINGS.features }, schedule: {}, keys: {}, treeOpen: [], graph: { ...DEFAULT_SETTINGS.graph }, highlight: { ...DEFAULT_HIGHLIGHT, rules: { ...DEFAULT_HIGHLIGHT.rules }, custom: [] }, textbook: { ...DEFAULT_SETTINGS.textbook } } };
}

/** Проверка и дополнение загруженных данных (старые файлы, импорт). */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на данные Мнемы');
  const r = raw as Partial<AppData>;
  if (r.version !== 1 || !Array.isArray(r.subjects) || !Array.isArray(r.topics) || !Array.isArray(r.cards)) {
    throw new Error('Файл не похож на данные Мнемы');
  }
  const lk = migrateLook(r.settings?.look, r.settings?.accent);
  return {
    version: 1,
    folders: Array.isArray(r.folders) ? r.folders : [],
    homework: Array.isArray(r.homework) ? r.homework : [],
    subjects: r.subjects,
    topics: r.topics,
    cards: r.cards,
    states: r.states && typeof r.states === 'object' ? r.states : {},
    logs: Array.isArray(r.logs) ? r.logs : [],
    tests: Array.isArray(r.tests) ? r.tests : [],
    deleted: r.deleted && typeof r.deleted === 'object' ? r.deleted : {},
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : Math.random().toString(36).slice(2, 10),
    settings: {
      ...DEFAULT_SETTINGS,
      ...(r.settings ?? {}),
      features: { ...DEFAULT_SETTINGS.features, ...(r.settings?.features ?? {}) },
      plugins: Array.isArray(r.settings?.plugins) ? r.settings!.plugins : [],
      pluginData: r.settings?.pluginData && typeof r.settings.pluginData === 'object' ? r.settings.pluginData : {},
      homeworkRemind: { ...DEFAULT_SETTINGS.homeworkRemind, ...(r.settings?.homeworkRemind ?? {}) },
      lessonsRemind: { ...DEFAULT_SETTINGS.lessonsRemind, ...(r.settings?.lessonsRemind ?? {}) },
      update: { ...DEFAULT_SETTINGS.update, ...(r.settings?.update ?? {}) },
      look: lk.look,
      ...(lk.accent ? { accent: lk.accent } : {}),
      motionOff: Array.isArray(r.settings?.motionOff) ? r.settings!.motionOff : [],
      cardTemplates: Array.isArray(r.settings?.cardTemplates) ? r.settings!.cardTemplates : [],
      modsOn: Array.isArray(r.settings?.modsOn) ? r.settings!.modsOn.map((m) => (m === 'neon' ? 'glow' : m)) : [],
      customMods: Array.isArray(r.settings?.customMods) ? r.settings!.customMods : [],
      awardsSeen: Array.isArray(r.settings?.awardsSeen) ? r.settings!.awardsSeen : [],
      userCss: typeof r.settings?.userCss === 'string' ? r.settings.userCss : '',
      schedule: { ...(r.settings?.schedule ?? {}) },
      keys: { ...(r.settings?.keys ?? {}) },
      treeOpen: Array.isArray(r.settings?.treeOpen) ? r.settings!.treeOpen : [],
      graph: { ...DEFAULT_SETTINGS.graph, ...(r.settings?.graph ?? {}) },
      highlight: {
        ...DEFAULT_HIGHLIGHT,
        ...(r.settings?.highlight ?? {}),
        rules: { ...DEFAULT_HIGHLIGHT.rules, ...(r.settings?.highlight?.rules ?? {}) },
        custom: Array.isArray(r.settings?.highlight?.custom) ? r.settings!.highlight.custom : []
      },
      textbook: { ...DEFAULT_SETTINGS.textbook, ...(r.settings?.textbook ?? {}) }
    }
  };
}

function loadInitial(): AppData {
  try {
    // На Android мост может быть готов раньше, чем собран window.mnemaApi (порядок загрузки частей сборки), — читаем прямо из него.
    const bridge = (window as unknown as { MnemaAndroid?: { load(k: string): string | null } }).MnemaAndroid;
    const json = window.mnemaApi ? window.mnemaApi.load() : bridge ? bridge.load(bridgeKey()) : localStorage.getItem(LS_KEY);
    if (json) return normalizeData(JSON.parse(json));
  } catch (e) {
    console.error('Не удалось прочитать данные', e);
  }
  return emptyData();
}

let data: AppData = typeof window !== 'undefined' ? loadInitial() : emptyData();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

function persistNow(sync = false) {
  if (!dirty) return;
  dirty = false;
  const json = JSON.stringify(data);
  try {
    if (window.mnemaApi) {
      if (sync) window.mnemaApi.saveSync(json);
      else void window.mnemaApi.save(json);
    } else {
      localStorage.setItem(LS_KEY, json);
    }
  } catch (e) {
    console.error('Не удалось сохранить', e);
    dirty = true;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => persistNow(true));
  // На телефоне приложение обычно не закрывают, а сворачивают — сохраняем сразу.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow(true);
  });
  (window as unknown as { __mnemaFlush?: () => void }).__mnemaFlush = () => persistNow(true);
}

function commit(next: AppData) {
  data = next;
  dirty = true;
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNow(false);
    emit('dataChanged');
  }, 400);
}

export function getData() {
  return data;
}

export function useData(): AppData {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => data
  );
}

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------- Предметы ----------

export function addSubject(name: string, color: string): Subject {
  const s: Subject = { id: uid(), name: name.trim(), color, createdAt: nowIso() };
  commit({ ...data, subjects: [...data.subjects, s] });
  return s;
}

export function updateSubject(id: string, patch: Partial<Omit<Subject, 'id'>>) {
  commit({ ...data, subjects: data.subjects.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s)) });
}

/** Отметить удаление (для синхронизации). */
function tomb(d: AppData, keys: string[]): AppData {
  if (!keys.length) return d;
  const now = nowIso();
  const deleted = { ...(d.deleted ?? {}) };
  for (const k of keys) deleted[k] = now;
  return { ...d, deleted };
}

/** Что удалено одним действием — чтобы можно было нажать «Вернуть». */
export interface Removed {
  subjects: Subject[];
  topics: Topic[];
  cards: Card[];
  states: AppData['states'];
  logs: AppData['logs'];
  marks: string[];
}

function captureRemoved(d: AppData, subjectIds: Set<string>, topicIds: Set<string>, cardIds: Set<string>, marks: string[]): Removed {
  const states: AppData['states'] = {};
  for (const [k, v] of Object.entries(d.states)) if (cardIds.has(k.split(':')[0])) states[k] = v;
  return {
    subjects: d.subjects.filter((x) => subjectIds.has(x.id)),
    topics: d.topics.filter((x) => topicIds.has(x.id)),
    cards: d.cards.filter((x) => cardIds.has(x.id)),
    states,
    logs: d.logs.filter((l) => cardIds.has(l.cardId)),
    marks
  };
}

/** Вернуть удалённое (кнопка «Вернуть» после удаления). */
export function restoreRemoved(r: Removed) {
  const deleted = { ...(data.deleted ?? {}) };
  for (const k of r.marks) delete deleted[k];
  const has = (arr: { id: string }[]) => new Set(arr.map((x) => x.id));
  const sIds = has(data.subjects);
  const tIds = has(data.topics);
  const cIds = has(data.cards);
  const stamp = nowIso();
  commit({
    ...data,
    deleted,
    subjects: [...data.subjects, ...r.subjects.filter((x) => !sIds.has(x.id)).map((x) => ({ ...x, updatedAt: stamp }))],
    topics: [...data.topics, ...r.topics.filter((x) => !tIds.has(x.id)).map((x) => ({ ...x, updatedAt: stamp }))],
    cards: [...data.cards, ...r.cards.filter((x) => !cIds.has(x.id)).map((x) => ({ ...x, updatedAt: stamp }))],
    states: { ...r.states, ...data.states },
    logs: [...data.logs, ...r.logs]
  });
}

export function deleteSubject(id: string): Removed {
  const topicIds = new Set(data.topics.filter((t) => t.subjectId === id).map((t) => t.id));
  const cardIds = new Set(data.cards.filter((c) => topicIds.has(c.topicId)).map((c) => c.id));
  const marks = ['subj:' + id, ...[...topicIds].map((t) => 'topic:' + t), ...[...cardIds].map((c) => 'card:' + c)];
  const removed = captureRemoved(data, new Set([id]), topicIds, cardIds, marks);
  commit(removeCards(tomb({ ...data, subjects: data.subjects.filter((s) => s.id !== id), topics: data.topics.filter((t) => !topicIds.has(t.id)) }, marks), cardIds));
  return removed;
}

// ---------- Темы ----------

export function addTopic(subjectId: string, name: string, parentId?: string, kind?: 'rule' | 'glossary'): Topic {
  const siblings = data.topics.filter((t) => t.subjectId === subjectId && (t.parentId ?? null) === (parentId ?? null) && t.kind === kind);
  const order = siblings.reduce((m, t) => Math.max(m, t.order ?? 0), 0) + 1;
  const t: Topic = { id: uid(), subjectId, name: name.trim(), note: '', parentId, order, createdAt: nowIso(), updatedAt: nowIso(), ...(kind ? { kind } : {}) };
  const treeOpen = parentId && !data.settings.treeOpen.includes(parentId) ? [...data.settings.treeOpen, parentId] : data.settings.treeOpen;
  commit({ ...data, topics: [...data.topics, t], settings: { ...data.settings, treeOpen } });
  return t;
}

export function updateTopic(id: string, patch: Partial<Omit<Topic, 'id'>>) {
  commit({ ...data, topics: data.topics.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)) });
}

/** id темы и всех её подтем. */
export function topicWithDescendants(d: AppData, id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of d.topics) if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
      out.add(t.id);
      grew = true;
    }
  }
  return out;
}

export function deleteTopic(id: string): Removed {
  const ids = topicWithDescendants(data, id);
  const cardIds = new Set(data.cards.filter((c) => ids.has(c.topicId)).map((c) => c.id));
  const marks = [...[...ids].map((t) => 'topic:' + t), ...[...cardIds].map((c) => 'card:' + c)];
  const removed = captureRemoved(data, new Set(), ids, cardIds, marks);
  commit(removeCards(tomb({ ...data, topics: data.topics.filter((t) => !ids.has(t.id)) }, marks), cardIds));
  return removed;
}

/**
 * Перенос темы: в другой предмет, внутрь другой темы (подтема) или перед/после соседа.
 * Подтемы едут вместе с темой. Нельзя положить тему внутрь её же подтемы.
 */
export function moveTopic(id: string, to: { subjectId: string; parentId?: string; beforeId?: string; afterId?: string }): boolean {
  const moving = topicWithDescendants(data, id);
  if (to.parentId && moving.has(to.parentId)) return false;
  const topic = data.topics.find((t) => t.id === id);
  if (!topic) return false;
  const parentId = to.parentId || undefined;
  const siblings = data.topics
    .filter((t) => t.id !== id && t.subjectId === to.subjectId && (t.parentId ?? undefined) === parentId)
    .sort(byOrder);
  let idx = siblings.length;
  if (to.beforeId) idx = Math.max(0, siblings.findIndex((t) => t.id === to.beforeId));
  else if (to.afterId) idx = siblings.findIndex((t) => t.id === to.afterId) + 1;
  const ordered = [...siblings.slice(0, idx), topic, ...siblings.slice(idx)];
  const orderOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const topics = data.topics.map((t) => {
    if (t.id === id) return { ...t, subjectId: to.subjectId, parentId, order: orderOf.get(t.id), updatedAt: nowIso() };
    if (moving.has(t.id)) return { ...t, subjectId: to.subjectId };
    if (orderOf.has(t.id)) return { ...t, order: orderOf.get(t.id) };
    return t;
  });
  const treeOpen = parentId && !data.settings.treeOpen.includes(parentId) ? [...data.settings.treeOpen, parentId] : data.settings.treeOpen;
  commit({ ...data, topics, settings: { ...data.settings, treeOpen } });
  return true;
}

export function moveSubject(id: string, beforeId?: string) {
  const rest = [...data.subjects].sort(byOrder).filter((s) => s.id !== id);
  const s = data.subjects.find((x) => x.id === id);
  if (!s) return;
  const idx = beforeId ? Math.max(0, rest.findIndex((x) => x.id === beforeId)) : rest.length;
  const ordered = [...rest.slice(0, idx), s, ...rest.slice(idx)];
  const orderOf = new Map(ordered.map((x, i) => [x.id, i + 1]));
  commit({ ...data, subjects: data.subjects.map((x) => ({ ...x, order: orderOf.get(x.id) })) });
}

export function byOrder(a: { order?: number; createdAt: string }, b: { order?: number; createdAt: string }) {
  return (a.order ?? 1e9) - (b.order ?? 1e9) || a.createdAt.localeCompare(b.createdAt);
}

/** Темы предмета (или подтемы темы) по порядку. */
/** Темы предмета на одном уровне (без правил — они живут отдельно). */
export function childTopics(d: AppData, subjectId: string, parentId?: string): Topic[] {
  return d.topics.filter((t) => t.subjectId === subjectId && !t.kind && (t.parentId ?? undefined) === (parentId ?? undefined)).sort(byOrder);
}

/** Правила предмета (верхний уровень). */
export function subjectRules(d: AppData, subjectId: string): Topic[] {
  return d.topics.filter((t) => t.subjectId === subjectId && t.kind === 'rule' && !t.parentId).sort(byOrder);
}

/** Общие термины предмета — те, что нужны во всём предмете, а не в одной теме. Живут в скрытой теме-«словаре предмета». */
export function subjectGlossaries(d: AppData, subjectId: string): Topic[] {
  return d.topics.filter((t) => t.subjectId === subjectId && t.kind === 'glossary').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function ensureGlossary(subjectId: string): { topic: Topic; list: StudyList } {
  let t = subjectGlossaries(data, subjectId)[0];
  if (!t) t = addTopic(subjectId, 'Общие термины', undefined, 'glossary');
  let list = t.lists?.[0];
  if (!list) list = addList(t.id, 'terms');
  return { topic: data.topics.find((x) => x.id === t.id)!, list };
}

// ---------- Стихи ----------

export function addPoem(topicId: string, init?: Partial<Poem>): Poem {
  const t = data.topics.find((x) => x.id === topicId);
  const p: Poem = { id: uid().slice(0, 8), title: init?.title ?? '', author: init?.author, text: init?.text ?? '', chunk: init?.chunk ?? 2, learned: 0, createdAt: nowIso(), updatedAt: nowIso() };
  updateTopic(topicId, { poems: [...(t?.poems ?? []), p] });
  return p;
}

export function updatePoem(topicId: string, poemId: string, patch: Partial<Omit<Poem, 'id'>>) {
  const t = data.topics.find((x) => x.id === topicId);
  if (!t) return;
  updateTopic(topicId, { poems: (t.poems ?? []).map((p) => (p.id === poemId ? { ...p, ...patch, updatedAt: nowIso() } : p)) });
}

export function deletePoem(topicId: string, poemId: string): Poem | undefined {
  const t = data.topics.find((x) => x.id === topicId);
  const p = t?.poems?.find((x) => x.id === poemId);
  if (t) updateTopic(topicId, { poems: (t.poems ?? []).filter((x) => x.id !== poemId), tabOrder: t.tabOrder?.filter((v) => v !== 'poem:' + poemId) });
  return p;
}

export function restorePoem(topicId: string, p: Poem) {
  const t = data.topics.find((x) => x.id === topicId);
  if (t) updateTopic(topicId, { poems: [...(t.poems ?? []), p] });
}

// ---------- Списки (словари) ----------

export const LIST_PRESETS: Record<ListKind, { title: string; cols: [string, string, string]; mode: ListMode; lang?: string; hint: string }> = {
  vocab: { title: 'Словарь', cols: ['Слово', 'Перевод', 'Пример'], mode: 'reverse', lang: 'en-US', hint: 'Иностранные слова: учишь в обе стороны, можно послушать произношение.' },
  terms: { title: 'Термины', cols: ['Термин', 'Определение', 'Пример'], mode: 'basic', hint: 'Понятие → его определение.' },
  dates: { title: 'Даты', cols: ['Дата', 'Событие', 'Подробнее'], mode: 'reverse', hint: 'Год ↔ событие, в обе стороны.' },
  formulas: { title: 'Формулы', cols: ['Название', 'Формула', 'Что значат буквы'], mode: 'basic', hint: 'Название → формула. Формулу пиши как в конспекте: $F = ma$.' },
  custom: { title: 'Список', cols: ['Вопрос', 'Ответ', 'Пояснение'], mode: 'basic', hint: 'Свои столбцы — назови их как удобно.' }
};

const listCardType = (mode: ListMode): CardType => (mode === 'reverse' ? 'reverse' : mode === 'typing' ? 'typing' : 'basic');

export function addList(topicId: string, kind: ListKind): StudyList {
  const p = LIST_PRESETS[kind];
  const t = data.topics.find((x) => x.id === topicId);
  const same = (t?.lists ?? []).filter((l) => l.kind === kind).length;
  const l: StudyList = { id: uid().slice(0, 8), kind, title: same ? `${p.title} ${same + 1}` : p.title, cols: [...p.cols], mode: p.mode, ...(p.lang ? { lang: p.lang } : {}) };
  updateTopic(topicId, { lists: [...(t?.lists ?? []), l] });
  return l;
}

export function updateList(topicId: string, listId: string, patch: Partial<Omit<StudyList, 'id'>>) {
  const t = data.topics.find((x) => x.id === topicId);
  if (!t) return;
  const lists = (t.lists ?? []).map((l) => (l.id === listId ? { ...l, ...patch } : l));
  let next: AppData = { ...data, topics: data.topics.map((x) => (x.id === topicId ? { ...x, lists, updatedAt: nowIso() } : x)) };
  if (patch.mode) {
    const type = listCardType(patch.mode);
    next = { ...next, cards: next.cards.map((c) => (c.topicId === topicId && c.listId === listId && c.type !== type ? { ...c, type, updatedAt: nowIso() } : c)) };
  }
  commit(next);
}

export function deleteList(topicId: string, listId: string) {
  const t = data.topics.find((x) => x.id === topicId);
  if (!t) return;
  const cardIds = new Set(data.cards.filter((c) => c.topicId === topicId && c.listId === listId).map((c) => c.id));
  const next = { ...data, topics: data.topics.map((x) => (x.id === topicId ? { ...x, lists: (x.lists ?? []).filter((l) => l.id !== listId), updatedAt: nowIso() } : x)) };
  commit(removeCards(tomb(next, [...cardIds].map((c) => 'card:' + c)), cardIds));
}

/** Строка списка → карточка. */
export function addListRow(topicId: string, list: StudyList, row: { a: string; b: string; c?: string }): Card {
  return addCard({ topicId, listId: list.id, type: listCardType(list.mode), front: row.a, back: row.b, why: row.c || undefined });
}

/** Несколько строк сразу (вставка списком). */
export function addListRows(topicId: string, list: StudyList, rows: { a: string; b: string; c?: string }[]) {
  const type = listCardType(list.mode);
  const stamp = nowIso();
  const cards: Card[] = rows.map((r) => ({ id: uid(), topicId, listId: list.id, type, front: r.a, back: r.b, why: r.c || undefined, createdAt: stamp, updatedAt: stamp }));
  commit({ ...data, cards: [...data.cards, ...cards] });
  return cards.length;
}

// ---------- Папки предметов ----------

export function addFolder(name: string, color: string, icon?: string): Folder {
  const f: Folder = { id: uid(), name: name.trim() || 'Папка', color, icon, order: data.folders.length + 1, createdAt: nowIso(), updatedAt: nowIso() };
  commit({ ...data, folders: [...data.folders, f], settings: { ...data.settings, treeOpen: [...data.settings.treeOpen, f.id] } });
  return f;
}

export function updateFolder(id: string, patch: Partial<Omit<Folder, 'id'>>) {
  commit({ ...data, folders: data.folders.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: nowIso() } : f)) });
}

/** Удалить папку: предметы из неё остаются, просто выходят на верхний уровень. */
export function deleteFolder(id: string) {
  const stamp = nowIso();
  commit(
    tomb(
      { ...data, folders: data.folders.filter((f) => f.id !== id), subjects: data.subjects.map((s) => (s.folderId === id ? { ...s, folderId: undefined, updatedAt: stamp } : s)) },
      ['folder:' + id]
    )
  );
}

/** Положить предмет в папку (или вынуть — folderId пустой). */
export function setSubjectFolder(subjectId: string, folderId?: string) {
  commit({ ...data, subjects: data.subjects.map((s) => (s.id === subjectId ? { ...s, folderId, updatedAt: nowIso() } : s)) });
}

export function sortedFolders(d: AppData): Folder[] {
  return [...d.folders].sort(byOrder);
}

// ---------- Домашние задания ----------

export function addHomework(h: Omit<Homework, 'id' | 'createdAt' | 'updatedAt'>): Homework {
  const x: Homework = { ...h, id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  commit({ ...data, homework: [...data.homework, x] });
  return x;
}

export function updateHomework(id: string, patch: Partial<Omit<Homework, 'id'>>) {
  commit({ ...data, homework: data.homework.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: nowIso() } : h)) });
}

export function toggleHomework(id: string) {
  const h = data.homework.find((x) => x.id === id);
  if (h) updateHomework(id, { done: !h.done, doneAt: h.done ? undefined : nowIso() });
}

export function deleteHomework(id: string) {
  commit(tomb({ ...data, homework: data.homework.filter((h) => h.id !== id) }, ['hw:' + id]));
}

export function sortedSubjects(d: AppData): Subject[] {
  return [...d.subjects].sort(byOrder);
}

export function toggleTreeOpen(id: string, open?: boolean) {
  const has = data.settings.treeOpen.includes(id);
  const want = open ?? !has;
  if (want === has) return;
  updateSettings({ treeOpen: want ? [...data.settings.treeOpen, id] : data.settings.treeOpen.filter((x) => x !== id) });
}

// ---------- Карточки ----------

export function addCard(card: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>): Card {
  const c: Card = { ...card, id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  commit({ ...data, cards: [...data.cards, c] });
  return c;
}

export function updateCard(id: string, patch: Partial<Omit<Card, 'id'>>) {
  let next = { ...data, cards: data.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c)) };
  // Если у карточки стало меньше элементов (убрали пропуск) — удаляем лишние состояния.
  const card = next.cards.find((c) => c.id === id);
  if (card) {
    const valid = new Set(itemOrds(card).map((o) => itemKey(id, o)));
    const states = { ...next.states };
    for (const k of Object.keys(states)) if (k.startsWith(id + ':') && !valid.has(k)) delete states[k];
    next = { ...next, states };
  }
  commit(next);
}

/** Удалить карточки с возможностью вернуть. */
export function deleteCardsUndoable(ids: string[]): Removed {
  const set = new Set(ids);
  const marks = ids.map((c) => 'card:' + c);
  const removed = captureRemoved(data, new Set(), new Set(), set, marks);
  commit(removeCards(tomb(data, marks), set));
  return removed;
}

export function deleteCard(id: string) {
  commit(removeCards(tomb(data, ['card:' + id]), new Set([id])));
}

function removeCards(d: AppData, ids: Set<string>): AppData {
  if (ids.size === 0) return d;
  const states = { ...d.states };
  for (const k of Object.keys(states)) if (ids.has(k.split(':')[0])) delete states[k];
  return {
    ...d,
    cards: d.cards.filter((c) => !ids.has(c.id)),
    states,
    logs: d.logs.filter((l) => !ids.has(l.cardId))
  };
}

/** Сброс прогресса карточки: она снова станет новой. */
export function resetCardProgress(id: string) {
  const states = { ...data.states };
  const keys = Object.keys(states).filter((k) => k.startsWith(id + ':'));
  for (const k of keys) delete states[k];
  commit(tomb({ ...data, states }, keys.map((k) => 'state:' + k)));
}

// ---------- Повторение ----------

export function recordReview(p: {
  key: string;
  cardId: string;
  topicId: string;
  rating: Grade;
  confidence?: Confidence;
  ms: number;
  now: Date;
}) {
  const prev = data.states[p.key];
  const next = gradeItem(prev, p.now, p.rating, data.settings);
  commit({
    ...data,
    states: { ...data.states, [p.key]: next },
    logs: [
      ...data.logs,
      {
        key: p.key,
        cardId: p.cardId,
        topicId: p.topicId,
        rating: p.rating as 1 | 2 | 3 | 4,
        prevState: prev ? prev.state : 0,
        confidence: p.confidence,
        at: p.now.toISOString(),
        ms: Math.min(p.ms, 5 * 60_000)
      }
    ]
  });
  emit('review', { cardId: p.cardId, topicId: p.topicId, rating: p.rating, state: next });
  return next;
}

// ---------- Настройки и данные ----------

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...data, settings: { ...data.settings, ...patch } });
}

export function setFeature(id: FeatureId, on: boolean) {
  updateSettings({ features: { ...data.settings.features, [id]: on } });
}

export function setScheduleDay(day: string, subjectIds: string[]) {
  updateSettings({ schedule: { ...data.settings.schedule, [day]: subjectIds } });
}

export function markLeechSeen(cardId: string) {
  commit({ ...data, cards: data.cards.map((c) => (c.id === cardId ? { ...c, leechSeen: true } : c)) });
}

export function addTestResult(r: Omit<TestResult, 'id' | 'at'>) {
  commit({ ...data, tests: [...data.tests, { ...r, id: uid(), at: nowIso() }] });
}

/** Добавить сразу много тем с карточками (импорт темы из файла, заметок Obsidian). */
export function importTopics(
  items: {
    subjectName: string;
    subjectColor?: string;
    topic: Pick<Topic, 'name' | 'note'> & Partial<Pick<Topic, 'examDate' | 'source' | 'lists' | 'kind' | 'poems'>>;
    cards?: (Pick<Card, 'type' | 'front' | 'back' | 'why'> & Partial<Pick<Card, 'listId'>> & {
      states?: Record<number, ItemState>;
      logs?: { ord: number; rating: 1 | 2 | 3 | 4; prevState: number; at: string; ms: number }[];
    })[];
  }[],
  targetSubjectId?: string
): { topics: number; cards: number; firstTopicId?: string } {
  let d = data;
  let topics = 0;
  let cards = 0;
  let firstTopicId: string | undefined;
  for (const it of items) {
    let subjectId = targetSubjectId;
    if (!subjectId) {
      const existing = d.subjects.find((s) => s.name.trim().toLowerCase() === it.subjectName.trim().toLowerCase());
      if (existing) subjectId = existing.id;
      else {
        const s: Subject = { id: uid(), name: it.subjectName.trim() || 'Без предмета', color: it.subjectColor ?? '#3A3F4E', createdAt: nowIso() };
        d = { ...d, subjects: [...d.subjects, s] };
        subjectId = s.id;
      }
    }
    const t: Topic = { id: uid(), subjectId, name: it.topic.name, note: it.topic.note, examDate: it.topic.examDate, source: it.topic.source, ...(it.topic.lists?.length ? { lists: it.topic.lists } : {}), ...(it.topic.kind === 'rule' ? { kind: 'rule' as const } : {}), ...(it.topic.poems?.length ? { poems: it.topic.poems } : {}), createdAt: nowIso(), updatedAt: nowIso() };
    firstTopicId ??= t.id;
    const newCards: Card[] = [];
    const states: Record<string, ItemState> = {};
    const logs: ReviewLogEntry[] = [];
    for (const c of it.cards ?? []) {
      const card: Card = { type: c.type, front: c.front, back: c.back, why: c.why, ...(c.listId && it.topic.lists?.some((l) => l.id === c.listId) ? { listId: c.listId } : {}), id: uid(), topicId: t.id, createdAt: nowIso(), updatedAt: nowIso() };
      newCards.push(card);
      for (const [ord, st] of Object.entries(c.states ?? {})) states[itemKey(card.id, Number(ord))] = st;
      for (const l of c.logs ?? []) logs.push({ key: itemKey(card.id, l.ord), cardId: card.id, topicId: t.id, rating: l.rating, prevState: l.prevState, at: l.at, ms: l.ms });
    }
    d = { ...d, topics: [...d.topics, t], cards: [...d.cards, ...newCards], states: { ...d.states, ...states }, logs: logs.length ? [...d.logs, ...logs].sort((a, b) => a.at.localeCompare(b.at)) : d.logs };
    topics++;
    cards += newCards.length;
  }
  commit(d);
  return { topics, cards, firstTopicId };
}

export function dismissTip(id: string) {
  if (data.settings.dismissedTips.includes(id)) return;
  updateSettings({ dismissedTips: [...data.settings.dismissedTips, id] });
}

export function replaceData(next: AppData) {
  commit(next);
  persistNow(false);
}

export function exportJson(): string {
  return JSON.stringify(data, null, 1);
}
