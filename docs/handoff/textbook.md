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
- Замеры: `scripts/ocr-eval/` (gen.mjs → чистые страницы из pages.mjs, degrade.mjs → «фото», run.mjs → прогон через vite-сервер vite.harness.mjs, score.mjs → CER/WER и структура). Пути в скриптах рассчитаны на scratchpad `/tmp/.../scratchpad/textbook/` — при переносе поправить.
  Запуск: `vite --config vite.harness.mjs` (порт 5199) → `node run.mjs <метка>` → `node score.mjs <метка>`.

## Первый прогон новой версии (physics_clean, 1 колонка/2 колонки) — что нашлось

Страница уже читается в правильном порядке колонок, переносы склеены, жирное (`внутренняя энергия`, `теплопроводностью`, `c`) найдено без ложных, рисунок вырезан, рамка найдена.
Осталось исправить (правки НЕ применены — последний python-патч не выполнился; повторить в `src/textbookText.ts`):

1. Tesseract рвёт justified-строки по широким пробелам на «обрывки» (отдельные блоки: «Хорошо» / «металлы,» / «проводят теплоту…») → в тексте порядок «Хорошо\n\nметаллы,\n\nпроводят…».
   План: `findGutters(lines, mh)` (покрытие слов по x, просвет ≤16% от максимума, шире 1.1·mh, по ≥5 строк по обе стороны) → `splitAtGutters` (рвать строку, захватившую обе колонки) → `mergeRows` (склеить обрывки одной строки в пределах колонки, baseline ±0.3·mh, зазор ≤4.5·mh, без просвета между); вызвать в начале `buildPage` после чистки; убрать `splitSideBySide`.
2. Подпись рисунка склеивалась со следующей колонкой: для `cap` ломать абзац при смене колонки (`!sameCol`).
3. Заголовок `§ 12.` получал `###`: проверять `PARA_SIGN = /^(?:§|\$|S|&)\s?\d{1,3}[.:\s]/` и для уровня, и в `isHeadingLine`; формулу с `=` без русских слов не считать заголовком (проверка до заголовка).
4. Заголовок рамки («Запомните») склеивался с первой строкой рамки: после `boxTitle` всегда `newPara = true`.
5. Одинокая строка из «—» → мусор (убрать из исключений в `isGarbageLine`); слово «—» с conf<15 отбрасывать, а не <40.
6. Маркеры списка «®»/«—» не превращаются в `- ` — разобраться (отладочный вывод строк: добавить `lines` в json в run.mjs); пункты должны идти подряд через `\n`.
7. Формула `Q = c·m·(t₂−t₁)` читается как «© = с: т. (ty —t1)» — улучшить (GLYPH_TARGET, формульные строки можно перечитывать).
8. Дальше: прогнать все 10 фото (`node run.mjs v1` → `node score.mjs v1`), смотреть heavy (поиск страницы на столе `findPageQuad` — в первом прогоне `quad:false` для clean, проверить на mild/heavy), подбирать GLYPH_TARGET (сейчас 22; glyph по physics_clean = 17.5 → scale 1.26).

## Статус (обновляй)

- [x] замеры «до», фикстуры, скрипты (scripts/ocr-eval, фикстуры test-fixtures/textbook)
- [x] каркас новых модулей, `tsc` зелёный на коммите ed8b1d9
- [ ] отладка по списку выше, замеры «после» на всех наборах
- [ ] юнит-тесты `src/textbook.test.ts` (fixOcrText, joinLines/isSoftHyphen, findGutters/mergeRows, buildPage на синтетических строках, assemble, parseAiMarkdown/sanitizeAiText, neutralizeHtml, squareToQuad/findPageQuad/skewOf)
- [ ] интерфейс `TextbookImport.tsx` (шаги, прогресс, показ `PageResult.note` и `quality`, телефон 390px), скриншоты
- [ ] `npm test`, `npm run build:web`, итоговый отчёт руководителю (замеры «после», скриншоты, коммиты, путь worktree)

Запуск замеров: vite-сервер `vite --config scripts/ocr-eval/vite.harness.mjs` из корня worktree (в конфиге зашит путь worktree и порт 5199; ROOT поправить), `PORT`; затем `node run.mjs <метка> [фильтр]` и `node score.mjs <метка>` из папки со скриптами (скрипты читают `pages/`, `photos/`, пишут `out/` — создать через `node gen.mjs && node degrade.mjs`; пути playwright: `/opt/node-tools/node_modules/playwright`, chromium `/opt/pw-browsers/chromium-1194`).
