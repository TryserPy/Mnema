# Refrain 1.31 — передача

Ветка в обоих репозиториях: `claude/wizardly-volta-879gpb` (TryserPy/Mnema и TryserPy/Mnema-site). PR не создан, сервер не выложен.

## Что готово

| Часть | Состояние | Где |
| --- | --- | --- |
| Контракты (фаза 1) | утверждены | `docs/refrain-1.31/contracts.md`, `shared/refrain/*`, `shared/prompts/{markup,tasks,luna}.ts`, `src/styleModel.ts` |
| Сервер и защита (фаза 2) | готово, 65 тестов | `server/`, `docs/refrain-1.31/security-review.md`, CI `.github/workflows/server.yml` (выкладка вручную) |
| D Клиент Refrain ИИ | готово | `shared/refrainClient.mjs`, `shared/aiCore.mjs`, `electron/ai.cjs`, `Bridge.java`, `src/refrain*.ts`, `src/components/{RefrainSettings,RefrainHost,LimitScreen,ReportProblem}.tsx` |
| C Промты | готово | `shared/prompts/templates.ts`, `src/prompts.ts`, `src/components/PromptsSettings.tsx` (в разделе «ИИ-помощник») |
| B Выноски | готово | `src/callout*.ts`, `src/callouts.css`, `NoteEditor.tsx`, `Markdown.tsx`, `mdImport/mdExport/obsidian.ts` |
| F Тетрадь и файлы | готово | `src/notebook*.ts`, `src/fileImport*.ts`, `src/components/NotebookImport.tsx`, пункт «Из тетради» в «Создать» |
| A Оформление | готово | `src/styleMigrate.ts`, `styleActions.ts`, `LookSettings.tsx`, `ModsSettings.tsx`, `AppearanceAiGuide.tsx`, `shared/prompts/styleReference.ts` |
| E Сайт | готово | Mnema-site: `admin/`, `tg/`, `privacy/`, `e2e/admin.mjs` |
| Фаза 4: подключения ведущего | готово | `luna.ts` STYLE ← `STYLE_REFERENCE`; `PromptsSettings` → «ИИ»; «Объяснить иначе»/«Формула»/«Из тетради»/«Дословно» → шаблоны C |

Ход работы каждого потока — `docs/refrain-1.31/progress/<поток>.md`. Патчи `wip/` влиты и удалены.

## Проверки (итог)

- `npx tsc --noEmit` — чисто; `npx vitest run` — 66 файлов / 1121 тест; `npx vite build` и `npx vite build --mode web` — собираются.
- `cd server && npx tsc --noEmit && npx vitest run` — 65 тестов.
- e2e против `npx vite preview --mode web --outDir dist-web --port 4174` (Playwright глобальный, Chromium `/opt/pw-browsers/chromium-1194`):
  - `e2e/v131-refrain.mjs` — вход, счётчик, лимит → «Без интернета», закрытый тест → приглашение, «Сообщить о проблеме» (22 ✓);
  - `e2e/v131-callouts.mjs` — выноски, светлая/тёмная × 1280/380 (89 ✓);
  - `e2e/v131-notebook.mjs` — фото разворота и .docx (всё ✓);
  - `e2e/v131-overflow.mjs` — все стили (144) и дополнения (240) × темы × ширины, ничего не вылезает.
- Mnema-site: `node e2e/admin.mjs` — 84 ✓.
- Поиск настоящих ключей и почт по изменённым файлам — чисто (примеры — `@example.com`, ключи в тестах — заглушки).

## Осталось

- Ручные шаги запуска сервера и адрес `REFRAIN_API` (сейчас `https://refrain-ai.example.workers.dev`) — `docs/refrain-1.31/launch.md`.
- Справочник стилей для ИИ ≈ 11 тыс. знаков — больше оценки `promptTokens: 2500` у задачи `style` (резерв занижен, списание по факту). Решить: сжать справочник или поднять оценку в контракте.
- «Тетрадь»: корешок разворота не ищется по картинке — режется посередине.
- «Разбить по темам с ИИ» в «Из тетради → Файл» идёт без Refrain ИИ (в реестре задач нет подходящей задачи) — только свой ключ / без интернета.
- Перед слиянием удалить рабочие заметки `progress/`.

## Решения по умолчанию (ждут владельца)

Brevo и `*.workers.dev`; лимиты из документа; старт в режиме «Тестировщики»; идеи раздела 9 не делаем; возраст учеников и 152-ФЗ/GDPR не решены.
