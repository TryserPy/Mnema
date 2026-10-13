// Модель оформления 1.31: «стиль + дополнения + мои правки» и формат .refrainstyle версии 3.
// Контракт для потоков A (оформление) и B (цвета выносок). Реализация переноса — styleMigrate.ts (поток A).
//  1. Стиль — ровно один, задаёт весь вид (цвета светлой и тёмной, шрифты, форма, раскладка, фон, анимации, код).
//  2. Дополнения — сколько угодно: «Тетрадь», «Крупные кнопки», «Фокус»… Меняют что-то одно.
//  3. Мои правки — поверх всего; «Сохранить как стиль» превращает их в свой стиль.
// Кусочки CSS («Свой код») остаются в settings.cssSnippets и применяются после дополнений, до моих правок.
import type { CssSnippet, Mod } from './types';
import type { StyleValues } from './styleSystem';

/** Версия файла .refrainstyle в 1.31. Файлы версии 2 (1.30) и .mnemamod читаются как раньше. */
export const STYLE_FORMAT_131 = 3;

export type StyleRole = 'style' | 'addon';

/** Свой шрифт внутри стиля. @font-face собирает приложение из этого поля; в css стиля @font-face по-прежнему запрещён. */
export interface StyleFont {
  /** Имя семейства: буквы, цифры, пробел и дефис, до 40 знаков. Подставляется как 'Refrain <id стиля> <family>', чтобы не пересекаться с системными. */
  family: string;
  /** data:font/woff2;base64,… или data:font/ttf;base64,… — не больше 400 КБ на шрифт и 1 МБ на стиль. Ссылки на сеть запрещены. */
  src: string;
  weight?: '400' | '500' | '600' | '700' | '400 700';
  style?: 'normal' | 'italic';
}

/** Поля, которые 1.31 добавляет к стилю (Mod) и к файлу .refrainstyle. */
export interface Mod131 extends Mod {
  /** Роль. Нет — определяется по содержимому (classifyRole в styleMigrate.ts): цвета, фон, вид, шрифты → стиль, иначе дополнение. */
  role?: StyleRole;
  fonts?: StyleFont[];
  /** Откуда стиль: встроенный, файл, ИИ, свой. Показывается в галерее вместо прежнего mod.where («из файла»). */
  origin?: 'builtin' | 'file' | 'ai' | 'mine';
}

/** Оформление в настройках (settings.appearance). Прежние поля 1.30 (modsOn, myStyle, look.style…) сохраняются один выпуск — для отката на 1.30. */
export interface Appearance {
  v: 1;
  /** id стиля: 'modern', 'classic', бывшие схемы ('scheme:<id>'), встроенные из каталога или свои. */
  style: string;
  /** id включённых дополнений по порядку применения. */
  addons: string[];
  /** Мои правки поверх всего (бывший «Мой вид» / myStyle). */
  edits?: Mod131;
  /** Значения настроек стилей и дополнений: id → id настройки → значение. */
  values: StyleValues;
  /** Последняя открытая вкладка «Оформления». */
  tab?: 'style' | 'addons' | 'motion' | 'code';
}

/** Порядок применения итогового CSS. */
export type ApplyOrder = ['style', 'addons', 'snippets', 'edits'];

/**
 * Правила переноса из 1.30 (ничего не должно пропасть):
 *  - стиль = последний включённый мод с ролью «стиль»; если таких нет — look.style ('modern' | 'classic') с палитрой look.light/look.dark;
 *  - остальные включённые моды — дополнения в прежнем порядке (в том числе «большие», если их было несколько);
 *  - myStyle → edits; look.custom (свои цвета) → edits.vars;
 *  - customMods остаются своими стилями/дополнениями с origin: 'file' | 'ai' | 'mine';
 *  - styleValues → values без изменений; cssSnippets не трогаются;
 *  - перенос идемпотентен: повторный запуск на уже перенесённых настройках ничего не меняет.
 */
export interface Migration130 {
  (settings: { modsOn: string[]; customMods: Mod[]; myStyle?: Mod; styleValues: StyleValues; cssSnippets: CssSnippet[]; look: { style?: 'modern' | 'classic'; light: string; dark: string; custom: { light?: Record<string, string>; dark?: Record<string, string> } } }): Appearance;
}
