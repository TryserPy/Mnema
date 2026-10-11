// Заставка при запуске рисуется раньше, чем читаются настройки, поэтому цвета последней темы лежат в localStorage
// (ключ refrain-splash) и ставятся маленьким скриптом public/splash-theme.js. Здесь — запись: после каждой смены темы или стиля
// берём ИТОГОВЫЕ цвета (то, что реально видно на экране, с учётом включённых стилей) и сохраняем как #rrggbb.
export const SPLASH_KEY = 'refrain-splash';

export interface SplashColors {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  dark: boolean;
}

let ctx: CanvasRenderingContext2D | null | undefined;

/** Любой цвет CSS (rgb(), color(srgb …), color-mix(), имя) → #rrggbb через холст: браузер сам всё посчитает. */
export function toHex(css: string): string | null {
  try {
    if (ctx === undefined) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      ctx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a < 250) return null; // прозрачное не годится как цвет заставки
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function resolveVar(name: string): string | null {
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${name})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return toHex(c);
}

export function readSplashColors(): SplashColors | null {
  if (!document.body) return null;
  const cs = getComputedStyle(document.body);
  const bg = toHex(cs.backgroundColor);
  const ink = toHex(cs.color);
  const accent = resolveVar('--accent');
  const onAccent = resolveVar('--on-accent');
  const muted = resolveVar('--muted');
  if (!bg || !ink || !accent) return null;
  return { bg, ink, muted: muted ?? ink, accent, onAccent: onAccent ?? '#ffffff', dark: document.documentElement.dataset.theme === 'dark' };
}

/** Запомнить цвета для следующей заставки. Ошибки (закрытое хранилище) молча игнорируются. */
export function cacheSplashTheme() {
  try {
    const c = readSplashColors();
    if (!c) return;
    const json = JSON.stringify(c);
    if (localStorage.getItem(SPLASH_KEY) !== json) localStorage.setItem(SPLASH_KEY, json);
  } catch {
    /* нет хранилища — заставка будет по системной теме */
  }
}
