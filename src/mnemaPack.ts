// Файл Refrain .mnema, версия 2 (1.32): всё, предмет или тема — конспекты, словари, стихи и карточки, без личного прогресса.
// Контрольная сумма (SHA-256) ловит повреждённый файл; по желанию — шифрование паролем (AES-GCM, как у облака).
// Версия 1 (одна тема, kind: 'mnema-topic') читается как раньше; одна тема без пароля и сейчас пишется версией 1 + checksum,
// чтобы её открыли и прежние выпуски Refrain.
import { decryptText, encryptText } from './cloud';
import { cleanIconImg } from './iconImage';
import { importTopicPackage, isTopicPackage, SHARE_EXT } from './share';
import { importTopics } from './store';
import type { AppData, Card, Topic } from './types';

export const PACK_VERSION = 2;
/** Больше этого файл не читаем: защита от огромных и «раздутых» файлов. */
export const PACK_MAX_BYTES = 60 * 1024 * 1024;
const MAX_ITEMS = 5000;
const MAX_CARDS = 200000;

type PackTopic = Pick<Topic, 'name' | 'note'> & Partial<Pick<Topic, 'lists' | 'kind' | 'poems'>>;
type PackCard = Pick<Card, 'type' | 'front' | 'back' | 'why'> & Partial<Pick<Card, 'listId' | 'occl'>>;

export interface PackItem {
  subject: { name: string; color: string; icon?: string; iconImg?: string };
  topic: PackTopic;
  cards: PackCard[];
}

export interface MnemaPack {
  kind: 'mnema-pack';
  version: 2;
  exportedAt: string;
  scope: 'all' | 'subject' | 'topic';
  title: string;
  items: PackItem[];
  /** SHA-256 (hex) от JSON.stringify(items). */
  checksum: string;
}

export type PackScope = { kind: 'all' } | { kind: 'subject'; id: string } | { kind: 'topic'; id: string };

async function sha256hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function itemOf(data: AppData, t: Topic): PackItem {
  const subject = data.subjects.find((s) => s.id === t.subjectId);
  return {
    subject: { name: subject?.name ?? 'Без предмета', color: subject?.color ?? '#3A3F4E', ...(subject?.icon ? { icon: subject.icon } : {}), ...(subject?.iconImg ? { iconImg: subject.iconImg } : {}) },
    topic: {
      name: t.name,
      note: t.note,
      ...(t.lists?.length ? { lists: t.lists } : {}),
      ...(t.kind ? { kind: t.kind } : {}),
      ...(t.poems?.length ? { poems: t.poems.map((p) => ({ id: p.id, title: p.title, author: p.author, text: p.text, chunk: p.chunk, learned: 0, createdAt: p.createdAt, updatedAt: p.updatedAt })) } : {})
    },
    cards: data.cards.filter((c) => c.topicId === t.id).map(({ type, front, back, why, listId, occl }) => ({ type, front, back, why, ...(listId ? { listId } : {}), ...(occl ? { occl } : {}) }))
  };
}

/** Что входит в файл (темы из корзины лежат отдельно и сюда не попадают). */
export function packTopics(data: AppData, scope: PackScope): Topic[] {
  const live = data.topics;
  if (scope.kind === 'topic') return live.filter((t) => t.id === scope.id);
  if (scope.kind === 'subject') return live.filter((t) => t.subjectId === scope.id);
  return live;
}

export function packTitle(data: AppData, scope: PackScope): string {
  if (scope.kind === 'topic') return data.topics.find((t) => t.id === scope.id)?.name ?? 'тема';
  if (scope.kind === 'subject') return data.subjects.find((s) => s.id === scope.id)?.name ?? 'предмет';
  return 'Refrain — всё';
}

/** Содержимое файла (текст JSON). С паролем — зашифрованная обёртка { mnemaEncrypted: 1, … }. */
export async function buildPack(data: AppData, scope: PackScope, password = ''): Promise<{ name: string; text: string; topics: number; cards: number }> {
  const topics = packTopics(data, scope);
  if (!topics.length) throw new Error('Здесь пока нет тем — нечего сохранять.');
  const items = topics.map((t) => itemOf(data, t));
  const checksum = await sha256hex(JSON.stringify(items));
  const title = packTitle(data, scope);
  const cards = items.reduce((n, it) => n + it.cards.length, 0);
  let json: string;
  if (scope.kind === 'topic' && !password) {
    // Версия 1 — её открывают и прежние выпуски; лишние поля они пропускают.
    const it = items[0];
    json = JSON.stringify({ kind: 'mnema-topic', version: 1, exportedAt: new Date().toISOString(), subject: it.subject, topic: it.topic, cards: it.cards, checksum }, null, 1);
  } else {
    const pack: MnemaPack = { kind: 'mnema-pack', version: PACK_VERSION, exportedAt: new Date().toISOString(), scope: scope.kind, title, items, checksum };
    json = JSON.stringify(pack);
  }
  const text = password ? await encryptText(json, password) : json;
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'Refrain';
  return { name: `${safe}${SHARE_EXT}`, text, topics: items.length, cards };
}

export type ReadPack = { ok: true; items: PackItem[]; title: string } | { ok: false; needPassword: true } | { ok: false; error: string };

/** Похоже на файл .mnema версии 2 или на зашифрованный файл (решит readPack). */
export function isPackFile(x: unknown): boolean {
  const o = x as { kind?: unknown; mnemaEncrypted?: unknown } | null;
  return Boolean(o && typeof o === 'object' && (o.kind === 'mnema-pack' || o.mnemaEncrypted === 1));
}

function isPack(x: unknown): x is MnemaPack {
  const p = x as MnemaPack;
  return Boolean(p && typeof p === 'object' && p.kind === 'mnema-pack' && Array.isArray(p.items));
}

/** Прочитать файл .mnema любой версии. Ничего не добавляет — только проверяет и разбирает. */
export async function readPack(text: string, password = ''): Promise<ReadPack> {
  if (text.length > PACK_MAX_BYTES) return { ok: false, error: 'Файл слишком большой для темы Refrain.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Файл повреждён: это не файл Refrain.' };
  }
  if (raw && typeof raw === 'object' && (raw as { mnemaEncrypted?: unknown }).mnemaEncrypted === 1) {
    if (!password) return { ok: false, needPassword: true };
    try {
      return readPack(await decryptText(text, password));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  if (isTopicPackage(raw)) {
    const v1 = raw as typeof raw & { checksum?: unknown };
    const item: PackItem = { subject: raw.subject, topic: raw.topic, cards: raw.cards };
    if (typeof v1.checksum === 'string' && v1.checksum !== (await sha256hex(JSON.stringify([item])))) return { ok: false, error: 'Файл повреждён: содержимое не совпадает с контрольной суммой. Попроси прислать его ещё раз.' };
    return { ok: true, items: [item], title: raw.topic.name };
  }
  if (isPack(raw)) {
    if (Number(raw.version) > PACK_VERSION) return { ok: false, error: 'Файл из более новой версии Refrain. Обнови приложение.' };
    if (raw.items.length > MAX_ITEMS) return { ok: false, error: 'В файле слишком много тем.' };
    if (typeof raw.checksum !== 'string' || raw.checksum !== (await sha256hex(JSON.stringify(raw.items)))) return { ok: false, error: 'Файл повреждён: содержимое не совпадает с контрольной суммой. Попроси прислать его ещё раз.' };
    const items = raw.items.filter((it) => it && it.topic && typeof it.topic.name === 'string' && Array.isArray(it.cards));
    if (items.reduce((n, it) => n + it.cards.length, 0) > MAX_CARDS) return { ok: false, error: 'В файле слишком много карточек.' };
    return { ok: true, items, title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : 'Refrain' };
  }
  return { ok: false, error: 'Это не тема Refrain.' };
}

/** Добавить разобранные темы. Предмет ищется по названию, иначе создаётся; прогресса в файле нет. */
export function importPack(items: PackItem[]): { topics: number; cards: number; firstTopicId?: string } {
  if (items.length === 1) return importTopicPackage({ kind: 'mnema-topic', version: 1, exportedAt: '', ...items[0] });
  // Каждую тему проверяет та же функция, что и файл версии 1 (типы карточек, словари, стихи) — через importTopics одним изменением.
  const TYPES = new Set(['basic', 'reverse', 'cloze', 'typing', 'problem', 'occlusion']);
  return importTopics(
    items.map((it) => ({
      subjectName: String(it.subject?.name ?? 'Без предмета'),
      subjectColor: it.subject?.color,
      subjectIcon: typeof it.subject?.icon === 'string' ? [...it.subject.icon].slice(0, 4).join('') : undefined,
      subjectIconImg: cleanIconImg(it.subject?.iconImg),
      topic: {
        name: String(it.topic.name).slice(0, 300),
        note: String(it.topic.note ?? ''),
        lists: Array.isArray(it.topic.lists) ? it.topic.lists.filter((l) => l && typeof l.id === 'string' && typeof l.title === 'string' && Array.isArray(l.cols)) : undefined,
        kind: it.topic.kind === 'rule' ? 'rule' : undefined,
        poems: Array.isArray(it.topic.poems)
          ? it.topic.poems.filter((p) => p && typeof p.text === 'string').map((p) => ({ id: String(p.id || Math.random().toString(36).slice(2, 10)), title: String(p.title ?? ''), author: p.author ? String(p.author) : undefined, text: p.text, chunk: Number(p.chunk) || 0, learned: 0, createdAt: String(p.createdAt ?? new Date().toISOString()), updatedAt: new Date().toISOString() }))
          : undefined
      },
      cards: it.cards
        .filter((c) => c && TYPES.has(c.type) && typeof c.front === 'string')
        .map((c) => ({ type: c.type, front: String(c.front), back: String(c.back ?? ''), why: c.why ? String(c.why) : undefined, listId: typeof c.listId === 'string' ? c.listId : undefined, occl: c.occl }))
    }))
  );
}

/**
 * Отдать файл: на телефоне в браузере — системное «Поделиться» (Telegram, почта, Диск), в приложении — системное сохранение,
 * иначе — скачивание. true — файл отдан (или ученик выбрал, куда), false — отменили.
 */
export async function shareOrSave(name: string, text: string, mime = 'application/x-refrain-topic'): Promise<boolean> {
  const api = window.mnemaApi;
  if (api?.saveFile) {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return api.saveFile(name, btoa(s), 'application/octet-stream');
  }
  const file = typeof File === 'function' ? new File([text], name, { type: mime }) : null;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // «Поделиться» недоступно — ниже обычное скачивание.
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

/** Открыть файл .mnema (выбор в настройках, перетаскивание, двойной щелчок): окно PackHost спросит пароль, если нужно, и добавит темы. */
export function openPack(text: string, name = ''): void {
  window.dispatchEvent(new CustomEvent('mnema:pack', { detail: { text, name } }));
}
