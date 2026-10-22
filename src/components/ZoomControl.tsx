// «Масштаб» в настройках оформления (src/zoom.ts): − 100% + и «Как было».
import { useEffect, useState } from 'react';
import { getZoom, setZoom, stepZoom, ZOOM_MAX, ZOOM_MIN, zoomLabel, zoomWay } from '../zoom';
import { touchUI } from './ui';

export function ZoomControl() {
  const [z, setZ] = useState(getZoom);
  useEffect(() => {
    const on = (e: Event) => setZ((e as CustomEvent<number>).detail);
    window.addEventListener('refrain:zoom', on);
    return () => window.removeEventListener('refrain:zoom', on);
  }, []);
  if (zoomWay() === 'browser')
    return <span className="small muted">В браузере на компьютере масштаб меняет сам браузер: Ctrl + и Ctrl −, Ctrl 0 — как было.</span>;
  const set = (v: number) => setZ(setZoom(v));
  return (
    <div className="zoom-ctl" role="group" aria-label="Масштаб интерфейса">
      <button type="button" className="icon-btn bordered" aria-label="Мельче" disabled={z <= ZOOM_MIN} onClick={() => set(stepZoom(z, -1))}>
        −
      </button>
      <output className="zoom-val" aria-live="polite">
        {zoomLabel(z)}
      </output>
      <button type="button" className="icon-btn bordered" aria-label="Крупнее" disabled={z >= ZOOM_MAX} onClick={() => set(stepZoom(z, 1))}>
        +
      </button>
      {z !== 1 && (
        <button type="button" className="btn small ghost" onClick={() => set(1)}>
          Как было
        </button>
      )}
      {!touchUI() && <span className="small muted">Ctrl + / Ctrl −</span>}
    </div>
  );
}
