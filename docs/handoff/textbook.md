# Конспект с фото учебника: заметка для передачи работы

Задача: «Конспект с фото учебника работает УЖАСНО — сделай в разы лучше». Ветка worktree: `worktree-agent-a370845ee40a2fce2`
(на origin уходит как `claude/nice-cerf-hsheob-textbook`). CHANGELOG.md не трогаем (запись соберёт руководитель).
Не трогать чужое: знакомство, боковая панель, контекстное меню, копирование, домашка.

## Замеры «до» (офлайн, Tesseract) — `test-fixtures/textbook/baseline-before.txt`

Синтетические «фото»: 3 страницы (physics — две колонки, формула, рамка, рисунок, список; biology — две колонки,
подзаголовки, список, рамка; history2 — две колонки, рамка, карта) × 3 уровня порчи (clean / mild: поворот 3°, тень,
шум, JPEG q70 / heavy: поворот −6°, перспектива, стол вокруг, полоса тени, шум, изгиб, JPEG q50) + готовый
`test-fixtures/page47.jpg` (одна колонка).

| набор | CER | WER | bag-recall слов |
|---|---|---|---|
| clean | 40% | 50% | 91% |
| mild | 53% | 72% | 89% |
| heavy | 76% | 134% | 75% |
| page47 (одна колонка) | 0% | 0% | 100% |

Причины: (1) Tesseract работал в режиме «один блок» (PSM 6 по умолчанию) — колонки склеивались построчно, плюс код
сортировал строки по y; (2) нет поиска страницы на столе и перспективы, нет выравнивания света; (3) жирное
по глобальному порогу → десятки ложных `**`; (4) рисунки находились только в «полноширинных» просветах; (5) заголовки
по высоте строки ловили шум; (6) абзацы рвались на каждой строке.

## Архитектура новой версии

- `shared/ocrShape.mjs` (+ `.d.mts`) — PSM 3 + разбор ответа Tesseract в строки (block, btype, baseline, sub/sup). Используют `electron/ocr.cjs` и `src/platform/ocrWeb.ts`.
- `src/textbookImage.ts` — чистые функции над пикселями: поиск страницы (`findPageQuad`), перспектива (`warpQuad`), выравнивание света (`flattenLight`), наклон (`skewOf`), размер букв (`medianGlyphHeight`).
- `src/textbookRegions.ts` — жирное (`strokeStat`), рисунки и рамки (`analyzeRegions`).
- `src/textbookText.ts` — чистый текст: `fixOcrText`, `buildPage` (XY-cut порядок блоков, абзацы, заголовки, списки, рамки, формулы), `assemble`, `parseAiMarkdown`/`sanitizeAiText` (ИИ).
- `src/textbook.ts` — склейка: `prepareOffline`, `recognizeOffline`, `recognizeWithAi` (с откатом на офлайн), `recropFigure`.
- Замеры: `test-fixtures/textbook/tools/` (gen.mjs → чистые страницы из pages.mjs, degrade.mjs → «фото», run.mjs → прогон через vite-сервер vite.harness.mjs, score.mjs → CER/WER и структура). Пути в скриптах рассчитаны на scratchpad `/tmp/.../scratchpad/textbook/` — при переносе поправить.
  Запуск: `vite --config vite.harness.mjs` (порт 5199) → `node run.mjs <метка>` → `node score.mjs <метка>`.

## Статус (обновляй)

- [x] замеры «до», фикстуры, скрипты
- [x] каркас новых модулей, `tsc` зелёный
- [ ] отладка конвейера на фикстурах (harness), подбор GLYPH_TARGET, порогов жирного/рисунков/рамок
- [ ] юнит-тесты `src/textbook.test.ts`
- [ ] интерфейс `TextbookImport.tsx` (шаги, прогресс, note/quality, телефон 390px), скриншоты
- [ ] промпт ИИ — готов; проверить разбор на кривых ответах (тесты)
- [ ] санитизация (`sanitizeAiText`, `neutralizeHtml`) — в тесты
- [ ] `npm test`, `npm run build:web`, итоговый отчёт руководителю (замеры «после», скриншоты, коммиты)
