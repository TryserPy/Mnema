# Поток C (промты и шаблоны) — ход работы

Ветка worktree перемотана (fast-forward) с main на коммит ведущего 7f40db1 (контракты 1.31).

## Готово
- `shared/prompts/templates.ts` — шаблоны gpt / claude / gemini / deepseek / small / universal, автоподбор, переменные, «🔒 Формат ответа».
- `src/types.ts` — `promptTemplates?` в `Settings`.
- `src/prompts.ts` — выбор шаблона (авто по модели из настроек ИИ, встроенный, свой), чистка настроек, `.refrainprompt`, встроенный пример страницы.
- `src/textbookNote.ts`, `src/aiCards.ts` — промты из шаблонов (`readSystem()` — новый, `READ_SYSTEM` — встроенный универсальный).
- `src/v130-textbook.test.ts` — два ожидания под выноски `[!def]`/`[!tip]`.
- `shared/prompts/luna.ts` «Тетрадь» + `promptVersion` n1 → n2; сервер зелёный.
- `src/v131-prompts.test.ts`.

## Доделано в новой сессии
- Временные файлы WIP (скриншоты, tmp-prompts) убраны; экран «Промты» проверен по скриншотам 380 и 1100 px.
- Подключения: `textbook.ts` → `readSystem()`; «Объяснить иначе» и «Формула» в `ai.ts` → `promptSystem('explain' | 'formula')`; `PromptsSettings` — в разделе «ИИ-помощник» (`Settings.tsx`, только где есть `aiGetConfig`).

## Проверки
- `npx tsc --noEmit` — без ошибок; `npx vitest run` — 63 файла / 1049 тестов зелёные; `npx vite build` и `--mode web` — собираются.

## Осталось
- `store.ts` normalizeData: чистка `promptTemplates` при загрузке (сейчас — при чтении в `prompts.ts`, этого достаточно).
- «Из тетради» (F) для своего ключа → `promptSystem('notebook.read')`.
