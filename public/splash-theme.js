// Цвета заставки из последней темы: приложение запоминает их при каждой смене темы или стиля (src/splashTheme.ts),
// а этот маленький скрипт ставит их до показа заставки. Берём только цвета вида #rrggbb — ничего другого сюда не попадёт.
(function () {
  try {
    // Страницу только что перезагрузили ради обновления — заставка в этом заходе уже была, второй раз не показываем.
    var t = Number(sessionStorage.getItem('refrain-no-splash'));
    if (t) {
      sessionStorage.removeItem('refrain-no-splash');
      if (Date.now() - t < 20000) document.documentElement.setAttribute('data-no-splash', '1');
    }
  } catch (e) {
    /* нет хранилища */
  }
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
