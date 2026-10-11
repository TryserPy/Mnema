# Refrain — фирменный стиль (референс для других чатов и репозиториев)

Приложение раньше называлось «Мнема», теперь — **Refrain** («Повтори — и запомни»).
Всё ниже лежит в репозитории `TryserPy/Mnema`, ветка `claude/gracious-babbage-wl86ok`.
Живые демо (открываются в браузере): [`site-logo-demo.html`](refrain/site-logo-demo.html) — логотип сайта, [`splash-demo.html`](refrain/splash-demo.html) — заставка приложения.

## Идея
Рефрен — то, что возвращается и застревает в голове. Поэтому у знака два приёма:
буква **R** и **эхо** — тонкие контуры-отголоски, которые уходят от R вправо, и кольцо, расходящееся от плитки.
Цвета: акцент `#3F51D8` (в тёмной теме светлее: `color-mix(in oklab, #3F51D8 50%, white)`), фон `#F6F3EC` / `#0E0F14`.

## 1. Иконка приложения
- Буква R шрифтом **Literata ExtraBold (800)** на цветной плитке; позади два контура-эха (обводка 11/1024 px, прозрачность .55 и .28, сдвиг вправо на 62 и 124 px от основной R при размере кегля 700 px).
- Файлы: `build/icon.png`, `build/icon.ico`, `electron/icon.png`, `web/icons/*`, `android/res/mipmap-*/ic_launcher.png` и `ic_theme_*.png` (по одной на тему).
- Эхо на мелких размерах (≤48 px) почти не видно, и это нормально.

## 2. Заставка приложения (Windows / Android / веб)
- Файлы: `src/splash.css`, разметка `<div id="splash">` в `index.html`, удаление после показа — в `src/main.tsx`.
- Порядок (≈1,9 с): плитка с R «отскакивает» → две волны-эха → буквы слова Refrain всплывают по очереди, у каждой остаётся контур-отголосок → подпись «Повтори — и запомни» → заставка тает.
- Только CSS, не мешает нажимать (`pointer-events: none`), при `prefers-reduced-motion` — без движения.

## 3. Анимация логотипа на сайте (появление и наведение)
Для сайта `TryserPy/Mnema-site` (чистые HTML/CSS/JS). У сайта уже есть механизм: класс `play` на `.mlogo` проигрывает анимацию, `pointerenter` на `[data-logo]` перезапускает (функция `replayLogo` в `js/app.js`, строка с `pointerenter`). Нужно заменить М на R и добавить эхо.

**Порядок кадров (всего 1,6 с):** точка бежит по контуру R (0,26–0,64 с) → R дорисована акцентным цветом → плитка раскрывается из круга и R становится белой (0,7–1,0 с) → **эхо стартует сразу, как R полностью видна (≈0,83 с)**: два контура уходят вправо на 3,4 и 6,8 px и тают, вокруг плитки расходится кольцо.
Важно: белая R должна стать видимой раньше, чем плитка станет непрозрачной, иначе синяя линия на синей плитке на миг пропадает (так было в первой версии).

Разметка (одинакова в шапке и в большом значке; путь R одинаков во всех трёх `path`):
```html
<span class="mlogo play" aria-hidden="true"><span class="mlogo-bg"></span><span class="mlogo-ring"></span>
    <svg viewBox="0 0 32 32"><path class="echo e2" d="M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10 M16.5 17.5 L23 24"/><path class="echo e1" d="M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10 M16.5 17.5 L23 24"/><path class="r" pathLength="100" d="M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10 M16.5 17.5 L23 24"/></svg>
    <span class="mlogo-dot"></span></span>
```
Путь R: `M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10 M16.5 17.5 L23 24` (viewBox 32×32, линия 3,4, скруглённые концы). Точка бежит по первой части пути (`offset-path`).

CSS (заменяет блок «логотип: точка → М → фон» в `css/style.css` и `css/mobile.css`):
```css
/* ───── логотип Refrain: точка бежит по R, R прорисовывается, плитка «раскрывается», вокруг расходится эхо ───── */
.mlogo{position:relative;display:inline-block;width:32px;height:32px;flex:none}
.mlogo-bg{position:absolute;inset:0;border-radius:9px;background:var(--accent);box-shadow:inset 0 -2px 0 rgba(0,0,0,.18)}
.mlogo svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.mlogo .r,.mlogo .echo{fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:0}
.mlogo .echo{opacity:0;stroke-width:1.1;stroke-dasharray:none}
.mlogo-dot{position:absolute;left:0;top:0;width:7px;height:7px;border-radius:50%;background:var(--accent-text);
  offset-path:path('M10 24 V8 H17 C21 8 23 10 23 12.5 C23 15 21 17 17 17 H10');offset-rotate:0deg;offset-anchor:50% 50%;opacity:0;pointer-events:none}
.mlogo-ring{position:absolute;inset:0;border-radius:9px;border:1.5px solid var(--accent-text);opacity:0;pointer-events:none}
.mlogo.play .mlogo-dot{animation:mDot 1.6s cubic-bezier(.6,0,.3,1) both}
.mlogo.play .r{animation:mDraw 1.6s cubic-bezier(.6,0,.3,1) both}
.mlogo.play .mlogo-bg{animation:mBg 1.6s cubic-bezier(.3,1.55,.5,1) both}
.mlogo.play .echo.e1{animation:mEcho 1.6s ease-out both;--dx:3.4px}
.mlogo.play .echo.e2{animation:mEcho 1.6s ease-out .05s both;--dx:6.8px}
.mlogo.play .mlogo-ring{animation:mRing 1.6s ease-out both}
@keyframes mDot{0%{opacity:1;offset-distance:0%;transform:scale(0)}10%{transform:scale(1.8)}16%{opacity:1;offset-distance:0%;transform:scale(1)}40%{opacity:1;offset-distance:100%;transform:scale(1)}48%,100%{opacity:0;offset-distance:100%;transform:scale(0)}}
@keyframes mDraw{0%,16%{stroke-dashoffset:100;stroke:var(--accent-text)}40%,44%{stroke-dashoffset:0;stroke:var(--accent-text)}54%,100%{stroke-dashoffset:0;stroke:#fff}}
@keyframes mBg{0%,44%{opacity:0;transform:scale(.25);border-radius:50%}62%,100%{opacity:1;transform:scale(1);border-radius:9px}}
/* эхо стартует сразу, как только R дорисована, и уходит вправо */
@keyframes mEcho{0%,50%{opacity:0;transform:translateX(0)}56%{opacity:.75;transform:translateX(0)}100%{opacity:0;transform:translateX(var(--dx))}}
@keyframes mRing{0%,50%{opacity:0;transform:scale(1)}56%{opacity:.6}100%{opacity:0;transform:scale(1.9)}}
/* при наведении плитка чуть «дышит» */
.brand:hover .mlogo-bg,.mlogo-big:hover .mlogo-bg{filter:brightness(1.08)}
.mlogo-big{position:relative;display:block;width:64px;height:64px;border:0;padding:0;background:none;cursor:pointer}
.mlogo-big .mlogo{position:absolute;left:0;top:0;transform:scale(2);transform-origin:0 0}
```
Также: `favicon.svg` — тот же R на плитке `#3F51D8` (без анимации), `<title>`, `og:title`, `apple-mobile-web-app-title`, текст «Мнема» на сайте → «Refrain»; в подвале буква-логотип `М` → `R`.

## Готовые фразы для другого чата
- Сайт: «В репозитории TryserPy/Mnema на ветке claude/gracious-babbage-wl86ok прочитай docs/refrain-brand.md и docs/refrain/site-logo-demo.html. Перенеси логотип и анимацию появления/наведения из раздела 3 на сайт (Mnema-site), включая css/mobile.css и favicon.svg, и переименуй Мнема → Refrain.»
- Приложение: «Прочитай docs/refrain-brand.md (ветка claude/gracious-babbage-wl86ok). Заставка и иконки из разделов 1–2 уже в коде; приведи [что именно] к тому же стилю.»
