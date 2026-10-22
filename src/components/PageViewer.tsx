// Фото страницы учебника: открывается по ссылке [стр. N], листается стрелками или номером страницы, приближается щелчком.
import { useEffect, useState } from 'react';
import type { PagePhoto } from '../types';
import { Modal } from './ui';
import { Pager } from './Pager';

export function PageViewer({ pages, page, onClose }: { pages: PagePhoto[]; page: number; onClose: () => void }) {
  const sorted = [...pages].sort((a, b) => a.n - b.n);
  const [i, setI] = useState(Math.max(0, sorted.findIndex((p) => p.n === page)));
  const [zoom, setZoom] = useState(false);
  const cur = sorted[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return; // стрелки в поле номера двигают курсор
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
        {sorted.length > 1 && <Pager index={i} total={sorted.length} numbers={sorted.map((p) => p.n)} onIndex={setI} />}
      </div>
    </Modal>
  );
}
