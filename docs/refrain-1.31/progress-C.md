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

## Осталось
- `src/components/PromptsSettings.tsx` (без пропсов) — написан (WIP), tsc зелёный; осталось глянуть в браузере (временная страница tmp-prompts.html, не коммитится).
- Полные проверки: tsc, vitest, vite build, vite build --mode web.

## Вопросы ведущему (в отчёт)
- `src/textbook.ts`: `READ_SYSTEM` → `readSystem()` (иначе «Дословно» и первый шаг нескольких страниц не видят выбранный шаблон).
- `src/store.ts` normalizeData: `promptTemplates: cleanPromptTemplates(r.settings?.promptTemplates)` (сейчас чистится при чтении в prompts.ts).
- `src/ai.ts`: explain/formula могут брать `promptSystem('explain' | 'formula')`.
