// Тяжёлые части (редактор формул, граф, импорт учебника) грузятся только когда нужны — окно открывается быстрее.
import { lazy, Suspense, type ComponentProps } from 'react';

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
    <Suspense fallback={<div className="empty">Рисую карту…</div>}>
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
