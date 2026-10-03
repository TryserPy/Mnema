// Хранилище данных: состояние в памяти + сохранение в файл (Electron) или localStorage (браузер).
import { copyCard, copyFolder, copySubject, copyTopic, type CopyResult } from './copy';
import { useSyncExternalStore } from 'react';
import { bridgeKey } from './platform/bridgeKey';
import type { Grade } from 'ts-fsrs';
import { DEFAULT_HIGHLIGHT } from './important';
import { DEFAULT_ACCENT, DEFAULT_LOOK, migrateLook } from './themes';
import { emit } from './plugins/bus';
import { CATALOG_PLUGINS } from './plugins/catalog';
import { gradeItem, itemKey, itemOrds } from './srs';
import { noteEdit } from './noteText';
import { cleanExam, cleanNoteHistory, cleanTopics, cleanTrash, validExamDate } from './safeData';
import type { AppData, NoteVersion, Removed, TrashEntry, Card, CardType, Poem, Confidence, Exam, FeatureId, Folder, Homework, ItemState, ListKind, ListMode, ReviewLogEntry, Settings, StudyList, Subject, TestResult, Topic } from './types';

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
      backupList?: () => Promise<{ name: string; size: number }[]>; // автокопии (раз в день, последние 8)
      backupRead?: (name: string) => Promise<string | null>;
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
      speakStop?: () => void;
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
      updateInstall?: (ask?: boolean) => Promise<boolean | { ok: boolean; permission?: boolean; error?: string }>;
      onUpdateEvent?: (cb: (e: { type: 'progress'; percent: number } | { type: 'ready'; version: string } | { type: 'error'; message: string }) => void) => () => void;
      /** Пункты «Мнемы» в меню выделения текста Android (пустой список — убрать). */
      setSelMenu?: (items: { id: string; title: string }[]) => void;
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
/** Так Android отвечает, если файл данных есть, но прочитать его не вышло (а не «файла ещё нет»). */
const READ_ERROR = '!read-error';

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
  motion: 'all',
  motionOff: [],
  retention: 0.9,
  newPerDay: 15,
  maxReviews: 200,
  dayStartHour: 4,
  showIntervals: true,
  simpleButtons: false,
  askConfidence: false,
  features: { schedule: false, obsidian: false, confidence: false, ai: false, handwriting: false, map: false, tray: false, voice: false, lists: true, rules: true, mods: false, homework: true, why: true, poems: true },
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

/** Возможности и поля, которых в 2.0 больше нет (достижения, сад, совет дня, переключатели ядра): из старых файлов не переносим, чтобы мёртвые данные не копились. */
const REMOVED_SETTINGS = ['awardsSeen', 'tips', 'dismissedTips'];
const REMOVED_FEATURES = ['awards', 'garden', 'leeches', 'test', 'focus', 'tips', 'weekly']; // последние пять стали частью ядра: всегда включены (кроме focus — теперь в поиске Ctrl+P)
export function dropRemoved(d: AppData): AppData {
  const st = d.settings as unknown as Record<string, unknown>;
  for (const k of REMOVED_SETTINGS) delete st[k];
  const f = d.settings.features as unknown as Record<string, unknown>;
  for (const k of REMOVED_FEATURES) delete f[k];
  return d;
}

/** Данные пришли «со стороны» (копия из файла): то, что может запустить чужой код или увести пароль, берём у ЭТОГО устройства, а не из файла.
 *  — моды из копии остаются в списке, но не запускаются, пока их не разрешат здесь (`pluginsSafe`);
 *  — облако (адрес, логин, автосинхронизация): с чужим адресом и `auto: true` Мнема сама отправила бы сохранённый пароль на чужой сервер. */
export function neutralizeForeign(d: AppData, local: AppData): { data: AppData; notes: string[] } {
  const notes: string[] = [];
  const ownCloud = local.settings.cloud ?? null;
  const theirs = d.settings.cloud ?? null;
  if (theirs && JSON.stringify(theirs) !== JSON.stringify(ownCloud)) notes.push('облако из копии не подключено — подключи его заново в «Настройки → Данные»');
  // Моды: доверяем только тому, что на этом устройстве уже стоит (тот же id и тот же код) или совпадает с каталогом по коду.
  // Всё остальное из файла приходит ВЫКЛЮЧЕННЫМ и без метки «из каталога» — иначе одно нажатие «Разрешить моды» запустило бы чужой код.
  const own = new Map(local.settings.plugins.map((p) => [p.id, p]));
  const catalog = new Map(CATALOG_PLUGINS.map((p) => [p.id, p.code]));
  const foreign: string[] = [];
  const plugins = (d.settings.plugins ?? []).map((p) => {
    const mine = own.get(p.id);
    if (mine && mine.code === p.code) return { ...p, enabled: mine.enabled, fromCatalog: mine.fromCatalog };
    if (catalog.get(p.id) === p.code) return { ...p, enabled: false, fromCatalog: true };
    foreign.push(p.name);
    return { ...p, enabled: false, fromCatalog: false };
  });
  if (foreign.length) notes.push(`моды из копии выключены (${foreign.slice(0, 5).join(', ')}) — включай их сам, только если им доверяешь`);
  return { data: { ...d, settings: { ...d.settings, plugins, pluginsSafe: true, cloud: ownCloud } }, notes };
}

/** Проверка и дополнение загруженных данных (старые файлы, импорт). */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на данные Мнемы');
  const r = raw as Partial<AppData>;
  if (r.version !== 1 || !Array.isArray(r.subjects) || !Array.isArray(r.topics) || !Array.isArray(r.cards)) {
    throw new Error('Файл не похож на данные Мнемы');
  }
  const lk = migrateLook(r.settings?.look, r.settings?.accent);
  const out: AppData = {
    version: 1,
    folders: Array.isArray(r.folders) ? r.folders : [],
    homework: Array.isArray(r.homework) ? r.homework : [],
    exams: Array.isArray(r.exams) ? r.exams.map(cleanExam).filter((e): e is Exam => e !== null) : [],
    subjects: r.subjects,
    ...(Array.isArray(r.trash) && r.trash.length ? { trash: cleanTrash(r.trash) } : {}),
    topics: cleanTopics(r.topics),
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
      userCss: typeof r.settings?.userCss === 'string' ? r.settings.userCss : '',
      // Свой фон — только картинка внутри данных и не больше 4 МБ (из чужой копии может прийти что угодно).
      bgImage:
        typeof r.settings?.bgImage?.src === 'string' && r.settings.bgImage.src.length < 4_000_000 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(r.settings.bgImage.src)
          ? { src: r.settings.bgImage.src, fade: Number.isFinite(r.settings.bgImage.fade) ? r.settings.bgImage.fade : 0.78 }
          : undefined,
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
  // История конспектов — только для тем, которые есть (или лежат в корзине): иначе от удалённых навсегда тем копился бы мусор.
  const known = new Set([...out.topics.map((t) => t.id), ...(out.trash ?? []).flatMap((x) => x.removed.topics.map((t) => t.id))]);
  const hist = cleanNoteHistory(r.noteHistory, known);
  if (hist) out.noteHistory = hist;
  return dropRemoved(out);
}

/** Файл данных есть, но не прочитался: работаем, но не сохраняем поверх (иначе потеряли бы всё). */
let readOnly = false;
export const dataReadOnly = () => readOnly;

function loadInitial(): AppData {
  try {
    // На Android мост может быть готов раньше, чем собран window.mnemaApi (порядок загрузки частей сборки), — читаем прямо из него.
    const bridge = (window as unknown as { MnemaAndroid?: { load(k: string): string | null } }).MnemaAndroid;
    const json = window.mnemaApi ? window.mnemaApi.load() : bridge ? bridge.load(bridgeKey()) : localStorage.getItem(LS_KEY);
    if (json === READ_ERROR || (bridge && !bridgeKey())) {
      readOnly = true;
      console.error('Файл данных не прочитался — сохранение отключено, чтобы его не затереть');
      return emptyData();
    }
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
    if (readOnly) {
      dirty = true; // файл данных не прочитался — не затираем его пустыми данными
      return;
    }
    if (window.mnemaApi) {
      // Не сохранилось (например, мост не принял вызов) — данные остаются «несохранёнными» и уйдут в следующий раз.
      if (sync) {
        if (window.mnemaApi.saveSync(json) === false) dirty = true;
      } else
        void window.mnemaApi.save(json).then(
          (ok) => {
            if (ok === false) dirty = true;
          },
          () => (dirty = true)
        );
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

export type { Removed };

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
  const subjects = [...data.subjects, ...r.subjects.filter((x) => !sIds.has(x.id)).map((x) => ({ ...x, updatedAt: stamp }))];
  const haveSubject = new Set(subjects.map((x) => x.id));
  // Тема встаёт на место, только если её предмет есть (иначе она «осиротеет» и пропадёт с экрана); подтема без родителя — обычная тема.
  const topicsAll = [...data.topics, ...r.topics.filter((x) => !tIds.has(x.id) && haveSubject.has(x.subjectId)).map((x) => ({ ...x, updatedAt: stamp }))];
  const haveTopic = new Set(topicsAll.map((x) => x.id));
  const topics = topicsAll.map((x) => (x.parentId && !haveTopic.has(x.parentId) ? { ...x, parentId: undefined } : x));
  const cards = [...data.cards, ...r.cards.filter((x) => !cIds.has(x.id) && haveTopic.has(x.topicId)).map((x) => ({ ...x, updatedAt: stamp }))];
  const haveCard = new Set(cards.map((x) => x.id));
  const states = { ...data.states };
  for (const [k, v] of Object.entries(r.states)) if (!states[k] && haveCard.has(k.split(':')[0])) states[k] = v;
  const logSeen = new Set(data.logs.map((l) => l.key + '|' + l.at));
  const key = r.marks.join('|');
  commit({
    ...data,
    deleted,
    subjects,
    topics,
    cards,
    states,
    logs: [...data.logs, ...r.logs.filter((l) => haveCard.has(l.cardId) && !logSeen.has(l.key + '|' + l.at))].sort((a, b) => a.at.localeCompare(b.at)),
    // вернули нажатием «Вернуть» — в корзине эта запись больше не нужна
    ...(data.trash?.length ? { trash: data.trash.filter((t) => t.removed.marks.join('|') !== key) } : {})
  });
}

// ---------- Корзина: недавно удалённое (только на этом устройстве) ----------

const TRASH_DAYS = 30;
const TRASH_MAX = 30;

/** Копия данных для облака, Wi-Fi-обмена и резервной копии: без корзины и истории конспектов (они остаются только на этом устройстве). */
export function forSync(d: AppData): AppData {
  return d.trash || d.noteHistory ? { ...d, trash: undefined, noteHistory: undefined } : d;
}

function withTrash(d: AppData, removed: Removed, label: string): AppData {
  if (!removed.subjects.length && !removed.topics.length && !removed.cards.length) return d;
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const keep = (d.trash ?? []).filter((t) => Date.parse(t.at) >= cutoff);
  const entry: TrashEntry = { id: uid(), at: nowIso(), label, removed };
  return { ...d, trash: [entry, ...keep].slice(0, TRASH_MAX) };
}

const plural2 = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
/** Подпись записи в корзине: что именно удалено. */
function labelOf(r: Removed, what: string): string {
  const parts = [r.topics.length > 1 ? `${r.topics.length} ${plural2(r.topics.length, 'тема', 'темы', 'тем')}` : '', r.cards.length ? `${r.cards.length} ${plural2(r.cards.length, 'карточка', 'карточки', 'карточек')}` : ''].filter(Boolean);
  return parts.length ? `${what} · ${parts.join(', ')}` : what;
}

/** Вернуть из корзины. false — запись уже исчезла. */
export function restoreFromTrash(id: string): boolean {
  const t = (data.trash ?? []).find((x) => x.id === id);
  if (!t) return false;
  // Тему нельзя вернуть без её предмета, карточку — без темы: сначала надо вернуть то, что выше (иначе она пропала бы с экрана). Запись остаётся в корзине.
  const subjects = new Set([...data.subjects, ...t.removed.subjects].map((x) => x.id));
  if (t.removed.topics.some((x) => !subjects.has(x.subjectId))) return false;
  const topics = new Set([...data.topics, ...t.removed.topics].map((x) => x.id));
  if (t.removed.cards.some((x) => !topics.has(x.topicId))) return false;
  restoreRemoved(t.removed);
  commit({ ...data, trash: (data.trash ?? []).filter((x) => x.id !== id) }); // на случай, если marks не совпали
  return true;
}

/** Удалить из корзины навсегда: одну запись или (без id) все. */
export function purgeTrash(id?: string) {
  commit({ ...data, trash: id ? (data.trash ?? []).filter((x) => x.id !== id) : [] });
}

export function deleteSubject(id: string): Removed {
  const topicIds = new Set(data.topics.filter((t) => t.subjectId === id).map((t) => t.id));
  const cardIds = new Set(data.cards.filter((c) => topicIds.has(c.topicId)).map((c) => c.id));
  const marks = ['subj:' + id, ...[...topicIds].map((t) => 'topic:' + t), ...[...cardIds].map((c) => 'card:' + c)];
  const removed = captureRemoved(data, new Set([id]), topicIds, cardIds, marks);
  const sub = data.subjects.find((s) => s.id === id);
  commit(withTrash(removeCards(tomb({ ...data, subjects: data.subjects.filter((s) => s.id !== id), topics: data.topics.filter((t) => !topicIds.has(t.id)) }, marks), cardIds), removed, labelOf(removed, `Предмет «${sub?.name ?? ''}»`)));
  return removed;
}

/**
 * Удалить сразу несколько папок, предметов и тем (выбранных в левой панели).
 * Предметы — со всеми темами и карточками, темы — с подтемами, папки — предметы остаются без папки.
 * Возвращает «Вернуть»: всё удалённое встаёт на место.
 */
export function deleteMany(sel: { folders?: string[]; subjects?: string[]; topics?: string[] }): () => void {
  const subjectIds = new Set(sel.subjects ?? []);
  const topicIds = new Set<string>();
  for (const t of data.topics) if (subjectIds.has(t.subjectId)) topicIds.add(t.id);
  for (const id of sel.topics ?? []) for (const x of topicWithDescendants(data, id)) topicIds.add(x);
  const cardIds = new Set(data.cards.filter((c) => topicIds.has(c.topicId)).map((c) => c.id));
  const folderIds = new Set(sel.folders ?? []);
  const folders = data.folders.filter((f) => folderIds.has(f.id));
  const inFolders = data.subjects.filter((x) => x.folderId && folderIds.has(x.folderId) && !subjectIds.has(x.id)).map((x) => ({ id: x.id, folderId: x.folderId! }));
  const marks = [...[...subjectIds].map((id) => 'subj:' + id), ...[...topicIds].map((id) => 'topic:' + id), ...[...cardIds].map((id) => 'card:' + id), ...[...folderIds].map((id) => 'folder:' + id)];
  const removed = captureRemoved(data, subjectIds, topicIds, cardIds, marks);
  const stamp = nowIso();
  const total = subjectIds.size + (sel.topics?.length ?? 0) + folderIds.size;
  commit(
    withTrash(
      removeCards(
        tomb(
          {
            ...data,
            folders: data.folders.filter((f) => !folderIds.has(f.id)),
            subjects: data.subjects.filter((x) => !subjectIds.has(x.id)).map((x) => (x.folderId && folderIds.has(x.folderId) ? { ...x, folderId: undefined, updatedAt: stamp } : x)),
            topics: data.topics.filter((t) => !topicIds.has(t.id))
          },
          marks
        ),
        cardIds
      ),
      removed,
      labelOf(removed, `Выбрано и удалено: ${total}`)
    )
  );
  return () => {
    restoreRemoved(removed);
    if (!folders.length) return;
    const back = nowIso();
    const have = new Set(data.folders.map((f) => f.id));
    const deleted = { ...(data.deleted ?? {}) };
    for (const f of folders) delete deleted['folder:' + f.id];
    const fOf = new Map(inFolders.map((x) => [x.id, x.folderId]));
    commit({
      ...data,
      deleted,
      folders: [...data.folders, ...folders.filter((f) => !have.has(f.id)).map((f) => ({ ...f, updatedAt: back }))],
      subjects: data.subjects.map((x) => (fOf.has(x.id) && !x.folderId ? { ...x, folderId: fOf.get(x.id), updatedAt: back } : x))
    });
  };
}

// ---------- Контрольные ----------

export interface ExamInput {
  id?: string; // не задан — новая; `topic:<id>` — контрольная из старой даты темы (станет записанной)
  subjectId: string;
  name: string;
  date: string; // YYYY-MM-DD
  topicIds: string[];
}

/** Создать или изменить контрольную. Дата, которая раньше стояла у темы (`Topic.examDate`), после этого живёт в записанной контрольной. */
export function saveExam(input: ExamInput): Exam {
  const stamp = nowIso();
  const topicIds = [...new Set(input.topicIds)].filter((id) => data.topics.some((t) => t.id === id));
  const known = input.id && !input.id.startsWith('topic:') ? (data.exams ?? []).find((e) => e.id === input.id) : undefined;
  const exam: Exam = {
    id: known?.id ?? uid(),
    subjectId: input.subjectId,
    name: input.name.trim() || 'Контрольная',
    date: validExamDate(input.date) ? input.date : known?.date ?? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    topicIds,
    createdAt: known?.createdAt ?? stamp,
    updatedAt: stamp
  };
  const old = input.id?.startsWith('topic:') ? input.id.slice(6) : null;
  const clear = new Set([...(old ? [old] : []), ...(known ? [] : topicIds)]);
  commit({
    ...data,
    exams: known ? (data.exams ?? []).map((e) => (e.id === known.id ? exam : e)) : [...(data.exams ?? []), exam],
    // дата у темы больше не нужна: контрольная её заменила (иначе одна и та же дата считалась бы дважды)
    topics: data.topics.map((t) => (clear.has(t.id) && t.examDate ? { ...t, examDate: undefined, updatedAt: stamp } : t))
  });
  return exam;
}

/** Удалить контрольную. Возвращает «Вернуть». */
export function deleteExam(id: string): () => void {
  if (id.startsWith('topic:')) {
    const tid = id.slice(6);
    const t = data.topics.find((x) => x.id === tid);
    const was = t?.examDate;
    if (t) updateTopic(tid, { examDate: undefined });
    return () => {
      if (was) updateTopic(tid, { examDate: was });
    };
  }
  const exam = (data.exams ?? []).find((e) => e.id === id);
  if (!exam) return () => {};
  commit(tomb({ ...data, exams: (data.exams ?? []).filter((e) => e.id !== id) }, ['exam:' + id]));
  return () => {
    const deleted = { ...(data.deleted ?? {}) };
    delete deleted['exam:' + id];
    commit({ ...data, deleted, exams: [...(data.exams ?? []), { ...exam, updatedAt: nowIso() }] });
  };
}

/** Пометить последний ответ по элементу: не помню / перепутал / не понял (по желанию; null — снять). Тип ошибки автоматически не определить. */
export function tagLastAnswer(key: string, err: 'forgot' | 'mixed' | 'lost' | null, mix?: string) {
  let i = data.logs.length - 1;
  while (i >= 0 && data.logs[i].key !== key) i--;
  if (i < 0) return;
  commit({
    ...data,
    logs: data.logs.map((l, j) => {
      if (j !== i) return l;
      const { err: _e, mix: _m, ...rest } = l;
      return err ? { ...rest, err, ...(err === 'mixed' && mix ? { mix } : {}) } : rest;
    })
  });
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
  const stamp = nowIso();
  const old = data.topics.find((t) => t.id === id);
  const history = old && patch.note !== undefined ? historyWith(data, old, patch.note, stamp, false) : data.noteHistory;
  commit({
    ...data,
    ...(history !== data.noteHistory ? { noteHistory: history } : {}),
    topics: data.topics.map((t) => {
      if (t.id !== id) return t;
      // noteAt — только когда текст конспекта правда поменялся: звёздочка, дата, порядок вкладок его не трогают (см. src/sync.ts).
      const edited = patch.note !== undefined && patch.note !== t.note;
      return { ...t, ...(edited ? noteEdit(t, data.deviceId, stamp) : {}), ...patch, updatedAt: stamp };
    })
  });
}

// ---------- История конспекта: прежние версии текста (только на этом устройстве) ----------

const HIST_MAX = 15; // версий на тему
const HIST_DAYS = 60;
const HIST_GAP = 10 * 60_000; // новый снимок — не чаще, чем раз в 10 минут правки
const HIST_CHARS = 1_500_000; // всего знаков по всем темам; сверх этого стираются самые старые

/**
 * Запомнить прежний текст перед правкой. Снимок делается, если прошло 10+ минут с прошлого, или текст резко сократился (случайно стёрли), или это первая правка.
 * Возвращает новое значение `noteHistory` (тот же объект, если ничего не менялось). `force` — снимок обязателен (перед возвратом версии).
 */
function historyWith(d: AppData, topic: Topic, next: string, stamp: string, force: boolean): AppData['noteHistory'] {
  const old = topic.note;
  if (!old.trim() || old === next) return d.noteHistory;
  const list = d.noteHistory?.[topic.id] ?? [];
  const last = list[0];
  if (last && last.note === old) return d.noteHistory;
  const gapOk = !last || Date.parse(stamp) - Date.parse(last.at) >= HIST_GAP;
  const shrunk = old.length >= 200 && next.length < old.length * 0.6;
  if (!force && !gapOk && !shrunk) return d.noteHistory;
  const cutoff = Date.parse(stamp) - HIST_DAYS * 86400000;
  const kept = [{ at: stamp, note: old }, ...list].filter((v) => Date.parse(v.at) >= cutoff).slice(0, HIST_MAX);
  return trimHistory({ ...(d.noteHistory ?? {}), [topic.id]: kept });
}

/** Общий потолок по размеру: убираем самые старые версии, пока всё не поместится. */
function trimHistory(h: NonNullable<AppData['noteHistory']>): NonNullable<AppData['noteHistory']> {
  let total = 0;
  for (const l of Object.values(h)) for (const v of l) total += v.note.length;
  if (total <= HIST_CHARS) return h;
  const all = Object.entries(h).flatMap(([id, l]) => l.map((v) => ({ id, v })));
  all.sort((a, b) => a.v.at.localeCompare(b.v.at));
  const drop = new Set<NoteVersion>();
  for (const x of all) {
    if (total <= HIST_CHARS) break;
    drop.add(x.v);
    total -= x.v.note.length;
  }
  const out: NonNullable<AppData['noteHistory']> = {};
  for (const [id, l] of Object.entries(h)) {
    const keep = l.filter((v) => !drop.has(v));
    if (keep.length) out[id] = keep;
  }
  return out;
}

/** Вернуть прежнюю версию конспекта. Текущий текст сам попадает в историю — шаг можно отменить. false — версии больше нет. */
export function restoreNoteVersion(topicId: string, at: string): boolean {
  const t = data.topics.find((x) => x.id === topicId);
  const v = data.noteHistory?.[topicId]?.find((x) => x.at === at);
  if (!t || !v) return false;
  const stamp = nowIso();
  commit({
    ...data,
    noteHistory: historyWith(data, t, v.note, stamp, true),
    topics: data.topics.map((x) => (x.id === topicId ? { ...x, ...noteEdit(x, data.deviceId, stamp), note: v.note, updatedAt: stamp } : x))
  });
  return true;
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
  const top = data.topics.find((t) => t.id === id);
  commit(withTrash(removeCards(tomb({ ...data, topics: data.topics.filter((t) => !ids.has(t.id)) }, marks), cardIds), removed, labelOf(removed, `Тема «${top?.name ?? ''}»`)));
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
  // Перетащил тему между соседями, а темы стоят по названию, — дальше порядок твой (только в этом предмете).
  // Сначала закрепляем порядок, который сейчас на экране, во ВСЕХ группах предмета — иначе подтемы у других
  // разделов перестроились бы по дате создания.
  const reorder = Boolean(to.beforeId || to.afterId);
  const target = data.subjects.find((x) => x.id === to.subjectId);
  let base = data;
  if (reorder && target && target.topicSort !== 'manual') {
    const cmp = topicOrder(data, to.subjectId);
    const groups = new Map<string, Topic[]>();
    for (const t of data.topics) if (t.subjectId === to.subjectId && !t.kind) groups.set(t.parentId ?? '', [...(groups.get(t.parentId ?? '') ?? []), t]);
    const fixed = new Map<string, number>();
    for (const g of groups.values()) g.sort(cmp).forEach((t, i) => fixed.set(t.id, i + 1));
    base = {
      ...data,
      topics: data.topics.map((t) => (fixed.has(t.id) ? { ...t, order: fixed.get(t.id) } : t)),
      subjects: data.subjects.map((x) => (x.id === to.subjectId ? { ...x, topicSort: 'manual' as const, updatedAt: nowIso() } : x))
    };
  }
  // Порядок считаем от того, что видно на экране (по названию или свой). Правила и словарь предмета — не соседи темы.
  const siblings = base.topics
    .filter((t) => t.id !== id && t.subjectId === to.subjectId && (t.parentId ?? undefined) === parentId && (t.kind ?? undefined) === (topic.kind ?? undefined))
    .sort(topicOrder(base, to.subjectId));
  let idx = siblings.length;
  if (to.beforeId) idx = Math.max(0, siblings.findIndex((t) => t.id === to.beforeId));
  else if (to.afterId) idx = siblings.findIndex((t) => t.id === to.afterId) + 1;
  const ordered = [...siblings.slice(0, idx), topic, ...siblings.slice(idx)];
  const orderOf = new Map(ordered.map((t, i) => [t.id, i + 1]));
  const topics = base.topics.map((t) => {
    if (t.id === id) return { ...t, subjectId: to.subjectId, parentId, order: orderOf.get(t.id), updatedAt: nowIso() };
    if (moving.has(t.id)) return { ...t, subjectId: to.subjectId };
    if (orderOf.has(t.id)) return { ...t, order: orderOf.get(t.id) };
    return t;
  });
  const treeOpen = parentId && !data.settings.treeOpen.includes(parentId) ? [...data.settings.treeOpen, parentId] : data.settings.treeOpen;
  commit({ ...base, topics, settings: { ...data.settings, treeOpen } });
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
/** Сравнение названий «как у людей»: «§2» раньше «§10», номера — раньше слов, «1. Введение» — рядом с «§1»;
 *  знак «§», «№», «#» в начале и пробел после него не мешают; регистр и ё не важны. */
const nameCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const sortKey = (name: string) => name.trim().replace(/^[§№#]\s*/, '');
export const byName = (a: { name: string }, b: { name: string }) => nameCollator.compare(sortKey(a.name), sortKey(b.name)) || nameCollator.compare(a.name.trim(), b.name.trim());

/** Порядок тем предмета: по названию (по умолчанию) или как расставил сам (перетаскиванием). */
export function topicOrder(d: AppData, subjectId: string): (a: Topic, b: Topic) => number {
  const sort = d.subjects.find((s) => s.id === subjectId)?.topicSort;
  return sort === 'manual' ? byOrder : (a, b) => byName(a, b) || byOrder(a, b);
}

export function childTopics(d: AppData, subjectId: string, parentId?: string): Topic[] {
  return d.topics.filter((t) => t.subjectId === subjectId && !t.kind && (t.parentId ?? undefined) === (parentId ?? undefined)).sort(topicOrder(d, subjectId));
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
  commit(withTrash(removeCards(tomb(data, marks), set), removed, cardsLabel(removed)));
  return removed;
}

/** Подпись для карточек в корзине: «Карточка «вопрос…»» или «Карточки: N». */
function cardsLabel(r: Removed): string {
  if (r.cards.length === 1) {
    const f = r.cards[0].front.replace(/\{\{|\}\}/g, '…').replace(/\s+/g, ' ').trim();
    return `Карточка «${f.length > 50 ? f.slice(0, 50) + '…' : f}»`;
  }
  return `Карточки: ${r.cards.length}`;
}

export function deleteCard(id: string) {
  const removed = captureRemoved(data, new Set(), new Set(), new Set([id]), ['card:' + id]);
  commit(withTrash(removeCards(tomb(data, ['card:' + id]), new Set([id])), removed, cardsLabel(removed)));
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
    const t: Topic = { id: uid(), subjectId, name: it.topic.name, note: it.topic.note, ...(it.topic.note.trim() ? noteEdit({}, d.deviceId, nowIso()) : {}), examDate: it.topic.examDate, source: it.topic.source, ...(it.topic.lists?.length ? { lists: it.topic.lists } : {}), ...(it.topic.kind === 'rule' ? { kind: 'rule' as const } : {}), ...(it.topic.poems?.length ? { poems: it.topic.poems } : {}), createdAt: nowIso(), updatedAt: nowIso() };
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

export function replaceData(next: AppData) {
  commit(next);
  persistNow(false);
}

export function exportJson(): string {
  return JSON.stringify(forSync(data), null, 1);
}

// ---------- Копии ----------


function applyCopy(r: CopyResult | null): CopyResult | null {
  if (!r) return null;
  const treeOpen = r.what === 'folder' ? [...r.data.settings.treeOpen, r.id] : r.data.settings.treeOpen;
  commit({ ...r.data, settings: { ...r.data.settings, treeOpen } });
  return r;
}
/** Копия темы вместе с подтемами, конспектом и карточками (без прогресса). */
export const duplicateTopic = (id: string) => applyCopy(copyTopic(data, id, uid, nowIso()));
/** Копия предмета: все темы, конспекты и карточки. */
export const duplicateSubject = (id: string) => applyCopy(copySubject(data, id, uid, nowIso()));
/** Копия папки вместе со всеми предметами внутри. */
export const duplicateFolder = (id: string) => applyCopy(copyFolder(data, id, uid, nowIso()));
/** Копия одной карточки (в той же теме). */
export const duplicateCard = (id: string) => applyCopy(copyCard(data, id, uid, nowIso()));
