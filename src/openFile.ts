// Файл Refrain, открытый из файлового менеджера (двойной щелчок, «Открыть с помощью») или командой «refrain файл».
// Главный процесс читает файл и присылает окну имя и текст; здесь — понять, что это, не меняя данные.
import { isTopicPackage, type importTopicPackage } from './share';
import { isPackFile } from './mnemaPack';
import { isStyleFile, OLD_STYLE_EXT, parseStyleFile, STYLE_EXT } from './styleSystem';
import type { Mod } from './types';

type TopicPackage = Parameters<typeof importTopicPackage>[0];

export type OpenedFile = { name: string; text: string };

export type OpenedResult =
  | { kind: 'topic'; pkg: TopicPackage }
  | { kind: 'style'; mod: Mod }
  | { kind: 'error'; message: string };

/** Расширения файлов, которые приложение открывает само (должны совпадать с electron/openFiles.cjs и с build.linux.fileAssociations). */
export const OPEN_EXTS = ['.mnema', STYLE_EXT, OLD_STYLE_EXT] as const;

/** Что лежит в файле: тема, стиль оформления или что-то неподходящее. Новые данные не создаёт. */
export function readOpenedFile(f: OpenedFile, styleId: string): OpenedResult {
  const name = String(f.name || '');
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!OPEN_EXTS.includes(ext as (typeof OPEN_EXTS)[number])) return { kind: 'error', message: `Файл «${name}» Refrain открыть не умеет` };
  let raw: unknown;
  try {
    raw = JSON.parse(f.text);
  } catch {
    return { kind: 'error', message: `«${name}» повреждён: это не файл Refrain` };
  }
  if (isTopicPackage(raw)) return { kind: 'topic', pkg: raw };
  // Версия 2 (всё, предмет) и файл с паролем — разберёт окно PackHost.
  if (isPackFile(raw)) return { kind: 'topic', pkg: raw as TopicPackage };
  if (isStyleFile(raw)) {
    try {
      return { kind: 'style', mod: parseStyleFile(f.text, styleId) };
    } catch (e) {
      return { kind: 'error', message: `«${name}»: ${(e as Error).message}` };
    }
  }
  return { kind: 'error', message: `«${name}» — не тема и не стиль Refrain` };
}
