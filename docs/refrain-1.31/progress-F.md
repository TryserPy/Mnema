# Поток F «Тетрадь и файлы» — ход работы

Ветка: `worktree-agent-a4aad8ef4673abf44` (от 7f40db1 — контракты 1.31).

## План (файлы)
- `src/notebook.ts` — чистые функции: разворот → две половины, «отбелить» клетку, метки `{?слово?}`, «Как в тетради», запрос `notebook.read`, разбор ответа, черновики карточек без ИИ.
- `src/notebookPhoto.ts` — canvas: загрузка фото, деление разворота (findSpine), уменьшение до 1600 px, JPEG для ИИ.
- `src/fileImport.ts` — .docx (fflate + свой разбор XML), Markdown/Notion (через `mdImport.ts`), разделы, «похоже на ДЗ», совпадение с темами, разбивка ИИ.
- `src/fileImportPdf.ts` — PDF с текстом без новой зависимости (объекты, ObjStm, Flate/AHx/A85, ToUnicode, Differences/cp1251), скан → картинки для «Фото».
- `src/components/NotebookImport.tsx`, `src/components/FileImport.tsx`, `src/notebook.css`, пункт в `CreateMenu.tsx`.
- `src/v131-notebook.test.ts`, `e2e/v131-notebook.mjs`, `test-fixtures/notebook/{biology.docx,make-docx.mjs,biology.pdf,scan.pdf}`.

## Готово (закоммичено)
- `src/notebook.ts` + тесты (разворот, клетка, запрос, ответ, {?…?}, «Как в тетради», черновики карточек).
- `src/fileImport.ts` + тесты (.docx-фикстура, без стилей, экранирование, XML-безопасность, разделы, ИИ-разбивка, ДЗ и сроки, совпадение тем, Markdown, Notion-архив в архиве).
- `src/fileImportPdf.ts` — работает на фикстурах Chrome (текст и скан); тесты рукописных PDF (WIP).

## В работе
- `fileImportPdf.ts`: 3 теста на самодельных PDF падают (ToUnicode bfrange, Differences/cp1251, ObjStm+ASCIIHex) — разбираюсь (вероятно, в тестовом построителе PDF или в /Contents без Length).

## Осталось
- `notebookPhoto.ts`, компоненты `NotebookImport.tsx`/`FileImport.tsx`, `notebook.css`, пункт «Из тетради» в `CreateMenu.tsx`.
- e2e `e2e/v131-notebook.mjs` (фото с заглушкой ИИ, .docx-фикстура).
- Полный прогон tsc / vitest / vite build / build --mode web.

## Решения и вопросы ведущему
- «Разбить по темам с ИИ»: в реестре задач нет подходящей задачи → запрос идёт БЕЗ поля `refrain` (свой ключ / без интернета), промт `SPLIT_SYSTEM` в `fileImport.ts`. Вопрос: добавить задачу (напр. `file.split`) в контракт?
- «Конспектом» из тетради — задача `textbook.merge` с текстом (tidyRequest).
- PDF читается без новой зависимости; зашифрованные PDF — понятная ошибка с советом.

## Проверки
- `npx vitest run src/v131-notebook.test.ts`: 36 из 39 (3 PDF-теста WIP). tsc — зелёный до добавления PDF.
