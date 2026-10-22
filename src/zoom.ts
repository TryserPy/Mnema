// Масштаб интерфейса (1.34): всё крупнее или мельче — и текст, и кнопки, и значки, а не только шрифт («Размер текста»).
// Хранится на этом устройстве (на телефоне и компьютере нужен разный), в данные и синхронизацию не попадает.
//   Windows и Linux (Electron) — настоящий масштаб окна (webFrame.setZoomFactor), как Ctrl + в браузере;
//   телефон и планшет (Android, браузер) — ширина страницы в <meta name="viewport">: при 125% страница шириной
//     360 px раскладывается как 288 px и растягивается на экран; «щипок» двумя пальцами при этом работает;
//   браузер на компьютере — масштаб самого браузера (Ctrl + / Ctrl −): страница не может поменять его сама.
import { recall, remember } from './uiMemory';

export const ZOOM_STEPS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.5] as const;
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

/** Следующий шаг крупнее (dir 1) или мельче (dir -1); с промежуточного значения — к ближайшему шагу в эту сторону. */
export function stepZoom(z: number, dir: 1 | -1): number {
  const cur = clampZoom(z);
  if (dir > 0) return ZOOM_STEPS.find((s) => s > cur + 0.001) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001) ?? ZOOM_MIN;
}

export type ZoomKey = 'in' | 'out' | 'reset';

/** Ctrl (или ⌘) + «=», «+», «−», «0» — и на основной клавиатуре, и на цифровой. */
export function zoomKey(e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ZoomKey | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') return 'in';
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'out';
  if (e.key === '0' || e.code === 'Numpad0') return 'reset';
  return null;
}

export const zoomAfter = (z: number, k: ZoomKey) => (k === 'reset' ? 1 : stepZoom(z, k === 'in' ? 1 : -1));
export const zoomLabel = (z: number) => `${Math.round(clampZoom(z) * 100)}%`;

/** Как на этом устройстве меняется масштаб. */
export type ZoomWay = 'app' | 'viewport' | 'browser';

export function zoomWay(): ZoomWay {
  if (typeof window === 'undefined') return 'browser';
  if (window.mnemaApi?.setZoom) return 'app';
  if (window.mnemaApi?.platform === 'android') return 'viewport';
  const touch = Boolean(window.matchMedia?.('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
  return touch ? 'viewport' : 'browser';
}

/** Ширина и масштаб для <meta name="viewport"> при данном масштабе и ширине экрана (CSS px при масштабе 100%). */
export function viewportContent(z: number, screenWidth: number): string {
  const k = clampZoom(z);
  const base = 'viewport-fit=cover, interactive-widget=resizes-content';
  if (k === 1 || !(screenWidth > 0)) return `width=device-width, initial-scale=1, ${base}`;
  return `width=${Math.round(screenWidth / k)}, initial-scale=${k}, ${base}`;
}

/** Ширина экрана в CSS px при масштабе 100% с учётом поворота (screen.width на части телефонов не меняется при повороте). */
function screenCssWidth(): number {
  const s = window.screen;
  const landscape = window.matchMedia?.('(orientation: landscape)').matches;
  const a = Math.min(s.width, s.height);
  const b = Math.max(s.width, s.height);
  return landscape ? b : a;
}

export function getZoom(): number {
  return clampZoom(recall<number>('zoom', 1));
}

let current = 1;
let listening = false;

/** Применить масштаб к окну. Возвращает, как он применён. */
export function applyZoom(z: number): ZoomWay {
  current = clampZoom(z);
  const way = zoomWay();
  document.documentElement.dataset.zoom = String(Math.round(current * 100));
  if (way === 'app') window.mnemaApi!.setZoom!(current);
  else if (way === 'viewport') {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta) meta.content = viewportContent(current, screenCssWidth());
    if (!listening) {
      listening = true;
      // Повернули телефон — ширина экрана другая, пересчитать.
      window.addEventListener('orientationchange', () => setTimeout(() => applyZoom(current), 250));
    }
  }
  return way;
}

/** Запомнить и применить. */
export function setZoom(z: number): number {
  const v = clampZoom(z);
  remember('zoom', v === 1 ? undefined : v);
  applyZoom(v);
  window.dispatchEvent(new CustomEvent('refrain:zoom', { detail: v }));
  return v;
}
