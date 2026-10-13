# Поток A «Оформление» — состояние

Ветка: `worktree-agent-a166d10aab02b35d5` (worktree `.claude/worktrees/agent-a166d10aab02b35d5`).
Ветка переведена fast-forward на `7f40db1` (контракты 1.31 из `claude/wizardly-volta-879gpb`): worktree был создан от `main` без них.

## Готово

- Прочитаны задание (`streams.md`, раздел A), контракты (`contracts.md`, `src/styleModel.ts`), спецификация (разделы 1–2).
- Разведка кода: `mods.ts`, `themes.ts`, `appearance.ts`, `styleApply.ts`, `styleSystem.ts`, `styleActions.ts`, `styleAi.ts`, `styleApi.ts`, `safeCss.ts`, `LookSettings.tsx`, `ModsSettings.tsx`, `StyleGallery.tsx`, `StyleEditor.tsx`, `StyleTabs.tsx`, `StyleAiPanel.tsx`, `Settings.tsx` (раздел look и поиск).

Кода пока не менялось.

## План (решения)

- `App.tsx` (не мой файл) применяет оформление по прежним полям (`look`, `accent`, `density`, `fontScale`, `bgImage`, `modsOn`, `myStyle`…). Поэтому `settings.appearance` — источник правды, а прежние поля — его «проекция»: каждое действие пишет и `appearance`, и проекцию. Заодно это и есть откат на 1.30.
- Порядок CSS по контракту: стиль → дополнения → кусочки CSS → мои правки (сейчас «Мой вид» идёт до сниппетов — поправить в `styleApply.ts`).
- Встроенные стили: «Современный», «Классический», схемы `scheme:<id>` (парами светлая/тёмная), «Стекло»; остальной каталог — дополнения.
- Перенос (`src/styleMigrate.ts`): по `Migration130`, идемпотентный; палитра/шрифт/углы/акцент, отличные от стиля, → `edits`.
- `fonts` в стиле: `@font-face` собирает приложение, в CSS стиля вырезается явно.
- Галерея: фильтр «Все · Встроенные · Мои», подпись из `origin`; убрать `BASE_TILES` и «Виды»; `design.css:92` — ширина `small-seg`.
- Редактор: дерево частей экрана + «Выбрать на экране»; часть «Конспект → Выноски» (`--co-*`).
- «Инструкция для ИИ»: копировать / .md / вставить ответ → `parseAiStyle` → до/после → применить, список выброшенного.
- `shared/prompts/styleReference.ts` + тест на совпадение со свежей генерацией.
- e2e `e2e/v131-overflow.mjs`.

## Осталось

Всё из плана выше. Проверки ещё не запускались.
