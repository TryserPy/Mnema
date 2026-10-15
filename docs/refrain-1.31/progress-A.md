# Поток A «Оформление» — состояние

Ветка: `worktree-agent-a166d10aab02b35d5` (worktree `.claude/worktrees/agent-a166d10aab02b35d5`).

## Готово (закоммичено)

- Модель «стиль + дополнения + мои правки» — `src/styleMigrate.ts`: `classifyRole`, `styleBase`, `projectAppearance` (appearance → поля 1.30), `diffEdits`, `countEdits`, `migrateAppearance` (= `migrate130: Migration130`, идемпотентный; сохранённый `appearance` — подсказка выбора стиля и вкладки, поля главнее), `appearanceOf`.
- `themes.ts`: `BASE_STYLES` — «Современный», «Классический», схемы парами (`scheme:coffee|ocean|forest|plum|midnight|contrast`), `schemeStyleFor`.
- Порядок CSS: `compileStyles(stack, snippets, edits)`; `styleApply.styleStack` строит стек из appearance (стиль → дополнения), правки после кусочков CSS.
- `store.ts`: перенос при загрузке (`normalizeData`); `types.ts`: `appearance?: Appearance`.
- `.refrainstyle` v3: роль, `fonts` (data:font, 400 КБ/1 МБ), `origin`; `@font-face` вырезается из CSS, собирается приложением (`fontFaceCss`, `withFontNames`). `parseStyleFile` ставит `origin: 'file'` (where «из файла» оставлен для отката).
- `v131-styles.test.ts` (17 тестов: роль, перенос, идемпотентность, проекция без потерь, порядок CSS, v3, шрифты). `v130-styles.test.ts`: «слишком новая» версия файла теперь 4 (v3 читается по контракту).
- `styleActions.ts`: действия 1.31 — `setAppearance`, `setAppearanceTab`, `pickStyle` (правки цветов сбрасываются при смене стиля — `editsForNewStyle`), `toggleAddon`, `moveAddon`, `resetEdits`, `setCurrent`, `currentAsStyle`, `saveEditsAsStyle`, `saveStyle`, `removeStyle`, `setAppearanceValue`.

## Дальше (по порядку)

1. UI: `LookSettings.tsx` — вкладки «Стиль · Дополнения · Анимации · Свой код» (вкладка в `appearance.tab`), карточка-сводка («Кофе · 3 правки поверх», «Настроить» раскрывает быстрые настройки + свой фон + значок + полный редактор, «Сбросить правки», «Сохранить как стиль»).
2. `ModsSettings.tsx`: галерея только стилей (одиночный выбор `pickStyle`), фильтр «Все · Встроенные · Мои», убрать `BASE_TILES`/«Виды»; вкладка «Дополнения» (переключатели, настройки, порядок). `StyleGallery.tsx:257` — подпись из `origin` (helper в mods.ts). `design.css:92` — ширина `small-seg`.
3. Перевести `StyleEditor`/`StyleAiPanel` на `saveStyle`/`setCurrent` (вместо `saveCustomStyle`/`toggleStyle`/`updateSettings(modToCurrent)`); дерево частей экрана + «Выбрать на экране»; часть «Конспект → Выноски» (`--co-*` в `styleApi.ts` + значения по умолчанию в design.css).
4. «Инструкция для ИИ» (новый `AppearanceAiGuide.tsx`): копировать / .md / вставить ответ → `parseAiStyle` → до/после → применить, список выброшенного.
5. `shared/prompts/styleReference.ts` (строка из `styleAi.styleReference()`, обновить под 1.31) + тест сверки.
6. Поиск по настройкам в `Settings.tsx` (якоря → вкладки).
7. e2e `e2e/v131-overflow.mjs`.

Проверки: tsc и vitest зелёные на коммите модели.
