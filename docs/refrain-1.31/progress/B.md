# Поток B (выноски и разметка) — ход работы

Ветка: `worktree-agent-ad77656398099ea8a` (от `claude/wizardly-volta-879gpb`, 7f40db1).

Решения ведущего: `src/obsidian.ts` менять можно (только выноски); атрибуты `data-callout` вместо правки MD_OWN_CLASSES — одобрено.

## Готово

- `src/callout.ts` — разбор `> [!type]` (CALLOUT_HEAD), вид из CALLOUTS (чужие типы — CALLOUT_TITLES, обычная рамка), рамки учебника ↔ выноски Obsidian (блоки кода и строки внутри выносок не трогаются).
- `src/components/Markdown.tsx` — выноска (div/details с data-callout), `{?слово?}`, `[стр. N]` плашкой.
- `src/calloutEditor.ts` + `NoteEditor.tsx` — узел «выноска» (шапка: вид · заголовок · убрать), ввод `[!def] `, «В выноску» в панели выделения, «Вставить → Выноска», `[стр. N]` атомом, подсветка `{?…?}`.
- `src/mdImport.ts` — выноски как есть; рамки, записанные экспортом, обратно рамками только для заметок Refrain (`refrain-id`). `src/mdExport.ts` — общий `legacyFramesToCallouts`. `src/obsidian.ts` — выноски как есть.
- `src/callouts.css` — цвета `var(--co-*, запасной)`.
- `src/v131-callouts.test.ts` — 15 тестов.
- Тесты, ожидавшие прежнее превращение выносок в «> **Заголовок**» (`features.test.ts`, `mdPortable.test.ts`), переведены на новое поведение по спецификации.

## Осталось

- `e2e/v131-callouts.mjs` (светлая/тёмная, редактор и просмотр).
- Полный прогон: tsc, vitest, vite build (оба режима).
