// Цвета заставки из последней темы: приложение запоминает их при каждой смене темы или стиля (src/splashTheme.ts),
// а этот маленький скрипт ставит их до показа заставки. Берём только цвета вида #rrggbb — ничего другого сюда не попадёт.
(function () {
  try {
    var raw = localStorage.getItem('refrain-splash');
    if (!raw) return;
    var o = JSON.parse(raw);
    var map = { bg: '--rs-bg', ink: '--rs-ink', muted: '--rs-muted', accent: '--rs-accent', onAccent: '--rs-on-accent' };
    var st = document.documentElement.style;
    for (var k in map) if (typeof o[k] === 'string' && /^#[0-9a-f]{6}$/i.test(o[k])) st.setProperty(map[k], o[k]);
  } catch (e) {
    /* нет сохранённой темы — заставка по системной */
  }
})();
