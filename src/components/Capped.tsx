// Длинные списки не раздувают экран: сначала первые `limit`, остальное — по кнопке «Ещё N».
// Раскрытый список прокручивается внутри себя, а не растягивает страницу.
import { useState, type ReactNode } from 'react';

export function Capped<T>({ items, limit = 8, render, className = '', as: Tag = 'div', after }: { items: T[]; limit?: number; render: (item: T, index: number) => ReactNode; className?: string; as?: 'div' | 'ul'; after?: ReactNode }) {
  const [all, setAll] = useState(false);
  const over = items.length > limit + 1; // «Ещё 1» ради одного элемента не показываем
  const more = (
    <button type="button" className="capped-more" aria-expanded={all} onClick={() => setAll(!all)}>
      {all ? 'Свернуть' : `Ещё ${items.length - limit}`}
    </button>
  );
  const shown = all || !over ? items : items.slice(0, limit);
  return (
    <>
      <Tag className={className + (all && over ? ' capped-open' : '')}>
        {shown.map(render)}
        {after}
        {over && (Tag === 'ul' ? <li className="capped-li">{more}</li> : more)}
      </Tag>
    </>
  );
}
