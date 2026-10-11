# Этап 2 — стили и бренд: заметка для продолжения

Ветка `claude/nice-cerf-hsheob`. Коммиты пушит другой агент — только новые коммиты, без amend/rebase.
Проверки: `npx tsc --noEmit`, `npm test`, `npm run build:web`. Браузерные проверки: Playwright (chromium из /opt/pw-browsers), скрипты/скриншоты в scratchpad/app2/.
В dev-режиме платформа «web»: окно «только для тестов» перекрывает интерфейс — в скриптах ставить `sessionStorage['mnema-web-test-ok']='1'` до загрузки.

## Сделано (хэши — в `git log`)
- Срочная правка: заставка в цвет темы — 588de0b (src/splashTheme.ts, public/splash-theme.js, index.html, splash.css). Закрыто, хэш отправлен координатору.
- А1 (API оформления): `src/styleApi.ts` (описание переменных, классов, data-part, атрибутов), `src/api.css` (раскладка по data-ui-*), переменные `--rf-*` с прежними значениями по умолчанию встроены в styles.css/design.css; `data-part` на app/sidebar/nav/main/tabs/topic-list/note/review-card/grades/modal. Тест `src/styleApi.test.ts` сверяет описание с CSS.
- А2 (формат): `src/styleSystem.ts` — файл `.refrainstyle` (kind `refrain-style`, formatVersion 1; старые `.mnemamod` читаются), настройки color/slider/select/toggle/text/font (привязка к `--var` или к атрибуту data-ui-*/data-st-*), vars light/dark, attrs, порядок включённых стилей = порядок `settings.modsOn` (последний перекрывает), сниппеты `settings.cssSnippets` (старый `userCss` переносится в сниппет `legacy`), значения `settings.styleValues`. Типы — в types.ts (Mod, StyleSetting, CssSnippet).
- А5 (безопасность): `sanitizeCss` в `src/safeCss.ts` усилен (url() только растровые data:image, @import/@document, `<`, управляющие знаки, повторная чистка, лимит 150000), `safeCssValue/safeFontFamily/safeVarName`; все значения настроек проверяются по типу. Тесты `src/styleSystem.test.ts`.
- А6 (производительность): `src/styleApply.ts` — один `<style id="refrain-styles">`, атрибуты на `<html>`, пересчёт только при смене ссылок settings.modsOn/customMods/styleValues/cssSnippets; App.tsx вызывает applyStyles в эффекте. Предпросмотр черновика: `setStylePreview({mod, values})` / `null` (откат).
- А4 (встроенные стили): в `src/mods.ts` CATALOG: старые 9 (Тетрадь получила настройки) + Компакт, Фокус, Плитки, Панель сверху, Панель справа, Крупно для планшета, Стекло.
- Sidebar: `useStyleAttr('sidebar')==='rail'` принудительно включает узкую панель.

## Осталось
- А3 (UI): переделать `src/components/ModsSettings.tsx` (раздел «Стили»): список включённых стилей с порядком (↑↓) и панель их настроек (компонент StyleSettingsPanel), «создать», «на основе существующего», экспорт/импорт `.refrainstyle` (parseStyleFile/styleToFile), сниппеты (список с переключателями), миграция импорта старых `.mnemamod`.
- А3 (редактор): `StyleEditor.tsx` — боковая панель (не модальное окно, чтобы интерфейс был виден), вкладки «Конструктор» (раскладка/плотность/скругление/шрифты/цвета/анимации → attrs и vars), «Код» (CSS + подсказки переменных/классов из styleApi.ts), «Настройки» (объявление настроек стиля), «Справка»; живой предпросмотр через setStylePreview, откат при отмене.
- А4: живой пример в галерее для раскладочных стилей (мини-приложение в StyleGallery.tsx; demoParts должен учитывать attrs; host получает data-ui-* атрибуты).
- Б: логотип R с эхо (docs/refrain-brand.md раздел 3, /home/user/Mnema-site/css/style.css блок .mlogo) в боковой панели/«О приложении», анимация при появлении и наведении, учёт prefers-reduced-motion и настройки «анимации выкл»; найти и заменить оставшиеся видимые «Мнема/Mnema» в интерфейсе (ключи хранения, расширения, имена пакетов не трогать — перечислить в отчёте); окно/таскбар/PWA-манифест/Android-строки — «Refrain».
- CHANGELOG.md (раздел 1.29.0): записи про стили, `.refrainstyle`, заставку, бренд.
- Проверка в браузере со скриншотами в scratchpad/app2/ (включить каждый встроенный стиль, 1280 и 360 px, тема Кофе и по умолчанию).

## Решения
- Атрибуты оформления: sidebar(left|right|top|rail), content(narrow|normal|wide|full), cards(default|flat|outline|sharp), grades(row|grid|tall), topics(list|tiles), tabs(underline|pills|boxed), anim(on|off). Ставятся на `<html>` как `data-ui-<имя>`; свои атрибуты стиля — `data-st-<имя>`. Раскладка не действует на телефоне (`.app.mobile`).
- Переменные из стиля выводятся с `!important` (иначе тему, заданную inline на `<html>`, не перекрыть).
- Светлый/тёмный вариант внутри стиля: `vars.light/dark` и `defaultDark` у цветовой настройки; для правил — `:root[data-theme='dark']`.

## Известные проблемы / вопросы
- Центрирование эмодзи (этап 1) проверено только на Linux.
