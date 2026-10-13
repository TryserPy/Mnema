# Поток F «Тетрадь и файлы» — ход работы

Ветка: `worktree-agent-a4aad8ef4673abf44` (перемотана fast-forward на 7f40db1 — контракты 1.31).

## План (файлы)
- `src/notebook.ts` — чистые функции: разворот → две половины, «отбелить» клетку, метки `{?слово?}`, «Как в тетради», запрос `notebook.read`, разбор ответа.
- `src/notebookPhoto.ts` — canvas: загрузка фото, деление разворота, уменьшение до 1600 px, запрос к ИИ.
- `src/fileImport.ts` — .docx (fflate), Markdown/Notion (через `mdImport.ts`), разделы, «похоже на ДЗ», совпадение с темами.
- `src/fileImportPdf.ts` — PDF с текстом без новой зависимости (FlateDecode через fflate, ToUnicode), скан → ветка «Фото».
- `src/components/NotebookImport.tsx`, `src/components/FileImport.tsx`, `src/notebook.css`, пункт в `CreateMenu.tsx`.
- `src/v131-notebook.test.ts`, `e2e/v131-notebook.mjs`, `test-fixtures/notebook/*.docx`.

## Готово
- (пока ничего; зависимости поставлены, документы прочитаны)

## В работе
- `src/notebook.ts`

## Осталось
- всё из плана выше

## Проверки
- ещё не запускались
