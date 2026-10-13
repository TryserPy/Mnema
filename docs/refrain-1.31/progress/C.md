# Поток C (промты и шаблоны) — ход работы

Ветка worktree перемотана (fast-forward) с main на коммит ведущего 7f40db1 (контракты 1.31): без него в ветке не было `docs/refrain-1.31` и `shared/prompts`.

## Готово
- Прочитаны задание, контракты, `shared/prompts/*`, промты в `textbookNote.ts`, `aiCards.ts`, `ai.ts`, раздел 7 спецификации.
- Код пока не менялся.

## План (что осталось)
1. `shared/prompts/templates.ts`: шаблоны gpt / claude / gemini / deepseek / small / universal для задач textbook.*, notebook.read, cards, explain, formula; автоподбор по имени модели; переменные `{{разметка}} {{предмет}} {{тема}} {{страница}} {{указания}}`; «🔒 Формат ответа» по задаче.
2. `src/prompts.ts`: выбор шаблона из `settings.promptTemplates`, кэш модели из `aiGetConfig`, чистка настроек, `.refrainprompt`, оценка токенов, встроенный пример страницы.
3. `src/textbookNote.ts`, `src/aiCards.ts`: промты берутся из шаблонов (новая разметка, выноски вместо «> **Запомните:**»).
4. `src/types.ts`: `promptTemplates?` в `Settings`.
5. `src/components/PromptsSettings.tsx` (без пропсов).
6. `luna.ts`: небольшая правка «Тетради» с `promptVersion` n1 → n2 (summary не трогать: серверный тест ждёт `s1`).
7. Тесты `src/v131-prompts.test.ts`; правка двух ожиданий в `src/v130-textbook.test.ts` под новую разметку (вопрос ведущему).

## Проверки
Ещё не запускались.
