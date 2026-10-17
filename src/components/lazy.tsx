// Тяжёлые части (редактор формул, граф, импорт учебника) грузятся только когда нужны — окно открывается быстрее.
import { lazy, Suspense, type ComponentProps } from 'react';
import { Skeleton } from './ui';

const FormulaInner = lazy(() => import('./FormulaEditor').then((m) => ({ default: m.FormulaEditor })));
export function FormulaEditor(p: ComponentProps<typeof FormulaInner>) {
  return (
    <Suspense fallback={null}>
      <FormulaInner {...p} />
    </Suspense>
  );
}

const MapInner = lazy(() => import('./KnowledgeMap').then((m) => ({ default: m.KnowledgeMap })));
export function KnowledgeMap(p: ComponentProps<typeof MapInner>) {
  return (
    <Suspense fallback={<Skeleton block lines={0} className="map-skel" label="Рисую карту…" />}>
      <MapInner {...p} />
    </Suspense>
  );
}

const TextbookInner = lazy(() => import('./TextbookImport').then((m) => ({ default: m.TextbookImport })));
export function TextbookImport(p: ComponentProps<typeof TextbookInner>) {
  return (
    <Suspense fallback={null}>
      <TextbookInner {...p} />
    </Suspense>
  );
}
