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

## Доделано в новой сессии
- PDF-тесты зелёные (39/39 в `v131-notebook.test.ts`).
- `src/notebookPhoto.ts` — снимок → страницы (разворот делится), «убрать клетку», 1600 px, JPEG; сканы PDF → картинки.
- `src/components/NotebookImport.tsx` (Фото и Файл в одном окне), `src/notebook.css`, пункт «Из тетради» в `CreateMenu.tsx`.
  - Фото: «Снять» / «Выбрать фото», фото рядом с текстом, `{?слово?}` правится нажатием, «Всё верно», «Как в тетради», «Править текст», «Дословно / Конспектом» (`textbook.merge`), черновики карточек с выбором; в новую тему или дописать в существующую.
  - Файл: .docx / PDF / Markdown / Notion → разделы; «Взять/Пропустить», «Дописать/Отдельно», «В домашку/В конспект» со сроком, «По заголовкам / Разбить по темам с ИИ», черновики карточек (до 12 на тему). PDF-скан → ветка «Фото».
  - Свой ключ: промты из шаблонов C (`promptSystem('notebook.read' | 'textbook.merge')`); `askAi` экспортирован из `ai.ts`.
- `e2e/v131-notebook.mjs` — фото разворота (ИИ — заглушка) и `biology.docx`, светлая 1280 и тёмная 380.

## Проверки
- `npx tsc --noEmit` — чисто; `npx vitest run` — 65 файлов / 1103 теста; `npx vite build` и `--mode web` — собираются.
- `e2e/v131-notebook.mjs` против `vite preview --mode web` — всё хорошо.

## Осталось
- Поиск корешка по картинке (сейчас разворот режется посередине — `spreadCuts(w, h, null)`).

## Решения и вопросы ведущему
- «Разбить по темам с ИИ»: в реестре задач нет подходящей задачи → запрос идёт БЕЗ поля `refrain` (свой ключ / без интернета), промт `SPLIT_SYSTEM` в `fileImport.ts`. Вопрос: добавить задачу (напр. `file.split`) в контракт?
- «Конспектом» из тетради — задача `textbook.merge` с текстом (tidyRequest).
- PDF читается без новой зависимости; зашифрованные PDF — понятная ошибка с советом.

## Проверки
- `npx vitest run src/v131-notebook.test.ts`: 36 из 39 (3 PDF-теста WIP). tsc — зелёный до добавления PDF.
