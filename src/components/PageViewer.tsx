// Фото страницы учебника: открывается по ссылке [стр. N], листается стрелками, приближается щелчком.
import { useEffect, useState } from 'react';
import type { PagePhoto } from '../types';
import { Icon, Modal, AnimText } from './ui';

export function PageViewer({ pages, page, onClose }: { pages: PagePhoto[]; page: number; onClose: () => void }) {
  const sorted = [...pages].sort((a, b) => a.n - b.n);
  const [i, setI] = useState(Math.max(0, sorted.findIndex((p) => p.n === page)));
  const [zoom, setZoom] = useState(false);
  const cur = sorted[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key === 'ArrowRight') setI((x) => Math.min(sorted.length - 1, x + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sorted.length]);
  if (!cur)
    return (
      <Modal title={`Страница ${page}`} onClose={onClose}>
        <p className="muted">Фото этой страницы не сохранено. При добавлении из учебника оставь галочку «Сохранить фото страниц».</p>
      </Modal>
    );
  return (
    <Modal title={`Страница ${cur.n}`} onClose={onClose} width={zoom ? 1200 : 760}>
      <div className="stack gap12">
        <div className={'page-view' + (zoom ? ' zoom' : '')} onClick={() => setZoom(!zoom)} title={zoom ? 'Уменьшить' : 'Приблизить'}>
          <img src={cur.img} alt={`Страница ${cur.n}`} />
        </div>
        {sorted.length > 1 && (
          <div className="row center-row gap12">
            <button className="icon-btn bordered" aria-label="Предыдущая страница" disabled={i === 0} onClick={() => setI(i - 1)}>
              <Icon name="left" />
            </button>
            <span className="muted">
              <AnimText value={`${i + 1} из ${sorted.length}`} />
            </span>
            <button className="icon-btn bordered flip" aria-label="Следующая страница" disabled={i === sorted.length - 1} onClick={() => setI(i + 1)}>
              <Icon name="left" />
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
