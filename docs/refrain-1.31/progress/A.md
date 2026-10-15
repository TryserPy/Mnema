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

## Доделано в новой сессии

- `LookSettings.tsx`: карточка текущего оформления («Кофе · 3 правки поверх», дополнения), «Настроить» раскрывает быстрые настройки, свой фон и значок (всё через `setCurrent`), «Сбросить правки», «Сохранить как стиль»; вкладки «Стиль · Дополнения · Анимации · Свой код» (запоминаются в `appearance.tab`).
- Поиск по настройкам: якорь → вкладка (`lookTabFor`), быстрые настройки раскрываются сами; новые пункты «Дополнения», «Инструкция для ИИ», «Сбросить мои правки».
- `AppearanceAiGuide.tsx` — «Инструкция для ИИ»: копировать / .md / вставить ответ → `parseAiStyle` → «До / После» на настоящем интерфейсе → применить; список выброшенного.
- `StyleEditor`/`StyleAiPanel` — на `saveStyle`/`setCurrent`/`currentAsStyle` (старые `saveCustomStyle`/`toggleStyle` больше не вызываются из интерфейса). В справке редактора — «Выбрать на экране» и подсветка части по нажатию на её метку.
- `styleApi.ts`: часть «Конспект → Выноски» (`--co-def|rule|tip|ex|warn`).
- `shared/prompts/styleReference.ts` (`STYLE_REFERENCE`) + тест сверки; подключён в `luna.ts` (STYLE), `promptVersion` style y1 → y2.
- `e2e/v131-overflow.mjs`: 9 стилей и все дополнения × светлая/тёмная × 1280/380 × «Сегодня», предмет, тема, «Оформление».

## Проверки

- `npx tsc --noEmit` — чисто; `npx vitest run` — 66 файлов / 1121 тест; `cd server && npx vitest run` — 65; `npx vite build` и `--mode web` — собираются.
- `e2e/v131-overflow.mjs`: стили — 144 проверки, дополнения — 240, ничего не вылезает.

## Осталось

- Справочник для ИИ ≈11 тыс. знаков — больше оценки `promptTokens: 2500` у задачи style (списание идёт по настоящему расходу, но резерв занижен). Решение — за владельцем: сжать справочник или поднять оценку в контракте.
- Старые действия `toggleStyle`/`moveStyle`/`saveCustomStyle` в `styleActions.ts` остались для совместимости (тесты 1.30).

Проверки: tsc и vitest зелёные на коммите модели.
