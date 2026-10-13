# Поток B (выноски и разметка) — ход работы

Ветка: `worktree-agent-ad77656398099ea8a`. Worktree был создан от `main` (a2e8db8) без контрактов; перемотан (fast-forward) на `claude/wizardly-volta-879gpb` (7f40db1).

## Готово

- Прочитаны streams.md (B), contracts.md (раздел 2), shared/prompts/markup.ts, раздел 7 спецификации.
- Разобран код: NoteEditor.tsx, Markdown.tsx, mdImport.ts:303–305, mdExport.ts (старые рамки `> **Запомните:**` → `> [!important]`), autoHighlight.ts (плашка `[стр. N]` в редакторе — украшение текста), obsidian.ts.

## План (в работе)

1. `src/callout.ts` — общий разбор `> [!type]` (CALLOUT_HEAD из markup.ts), вид (иконка/заголовок из CALLOUTS, неизвестные — CALLOUT_TITLES), перевод старых рамок туда и обратно.
2. `Markdown.tsx` — расширение marked «callout», `{?слово?}` (MARKS.unsure); классы не в MD_OWN_CLASSES (чужой файл) — поэтому атрибуты `data-callout`.
3. `src/calloutEditor.ts` + `NoteEditor.tsx` — узел TipTap «выноска» (тип, заголовок, свёртка), ввод `[!def] `, «В выноску» в меню выделения и в «Вставить», плашка `[стр. N]` атомом, подсветка `{?…?}`.
4. `mdImport.ts` — выноски как есть; старые рамки обратно только для заметок Refrain (`refrain-id`). `mdExport.ts` — выноски не трогает.
5. `src/callouts.css` — цвета `var(--co-*, запасной)`.
6. `src/v131-callouts.test.ts`, `e2e/v131-callouts.mjs`.

## Проверки

Ещё не запускались (код не менялся).

## Вопросы ведущему (предварительно)

- `src/obsidian.ts` (`convertObsidian`, окно «Импорт из Obsidian» в предмете) тоже превращает выноски в цитату — файл не в списке B.
