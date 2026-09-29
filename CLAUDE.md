# Мнема — заметки для Claude

Офлайн-приложение для школьников: конспект → карточки → повторения по расписанию (FSRS). Один код на
TypeScript + React 19 + Vite, две обёртки: **Windows** (Electron, NSIS) и **Android** (своя обёртка WebView, без androidx).
Девиз: «запоминать больше за меньшее время». Подробное описание проекта — `docs/PROJECT.md`.

## Как работать
- Отвечать автору по-русски, коротко; в конце — что сделано, как пользоваться, что не проверено, 3–5 идей.
- Продукт для других людей: простые слова, понятно ребёнку. Одна главная кнопка на экране, редкое — в «⋯»,
  новые функции — за переключателем в «Возможностях». Выключенная функция нигде не видна.
- Не допускать: вылезающий текст, меню за краем окна, длинные прокручиваемые страницы, серые полосы прокрутки, тормоза.
- На телефоне (ширина < 720 или `pointer: coarse`) — никаких подсказок про клавиши и мышь.
- Функции опираются на исследования о памяти (самопроверка, интервалы, самообъяснение…).
- Честно писать, что не проверено на настоящем устройстве.

## Код
- Логика — в чистых модулях с тестами (`src/srs.ts`, `poem.ts`, `links.ts`, `rules.ts`, `update.ts`…), интерфейс — в `src/components`, `src/screens`.
- Всё состояние — один объект `AppData` (`src/types.ts`), операции — `src/store.ts`. Новые поля только необязательные, миграции мягкие.
- Комментарии и тексты интерфейса — по-русски.
- Android: Java 8, minSdk 24, `javac` против `android.jar`; UI — только через `runOnUiThread`.

## Проверки
```bash
npx tsc --noEmit && npx vitest run && npx vite build
# e2e в браузере (Playwright установлен глобально):
(setsid nohup npx vite preview --port 4174 --strictPort >/tmp/preview.log 2>&1 &)
NODE_PATH=$(npm root -g) URL=http://localhost:4174 OUT=out node e2e/m1.mjs
# e2e в Electron:
NODE_PATH=$(npm root -g) xvfb-run -a node e2e/e163.mjs
```
Раскладку проверять на 1280, 900 и 390 px и смотреть скриншоты глазами.

## Выпуск
1. Версия в `package.json` и `src/update.ts` (`APP_VERSION`), «Новое в X» в `src/screens/Settings.tsx`, раздел в `README.md`, запись в `CHANGELOG.md`.
2. Тег `vX.Y.Z` → `.github/workflows/release.yml` собирает APK и установщик Windows и публикует выпуск на GitHub.
3. Приложение само берёт обновления из выпусков `TryserPy/Mnema` (репозиторий должен быть публичным).
4. Ключ подписи APK — только в секрете `ANDROID_KEYSTORE_B64`, в репозиторий не класть. Ключ один на все версии.

## Агенты
В `.claude/agents/` — помощники: `security-reviewer`, `test-runner`, `design-reviewer`, `mobile-tester`, `code-reviewer`,
`android-engineer`, `data-guardian`, `perf-auditor`, `copy-editor`, `idea-generator`, `release-manager`.
