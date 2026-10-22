// Листалка «‹ [ 7 ] из 12 ›» (1.34): номер страницы можно не только листать кнопками, но и ввести числом.
// На телефоне — цифровая клавиатура и «Перейти»; Enter или уход из поля применяет номер, Esc — возвращает прежний.
// numbers — «настоящие» номера страниц (фото учебника: 45, 46, 48…); без них страницы — 1..total.
import { useEffect, useId, useRef, useState } from 'react';
import { pageIndexFor, plainNumbers } from '../pageNumber';
import { Icon } from './ui';

/** Когда видимая часть окна уменьшится (открылась клавиатура), прокрутить к полю — после того как раскладка успела пересчитаться. */
export function keepVisible(el: HTMLElement) {
  const vv = window.visualViewport;
  if (!vv) return;
  const onResize = () => requestAnimationFrame(() => requestAnimationFrame(() => el.isConnected && el.scrollIntoView({ block: 'nearest' })));
  vv.addEventListener('resize', onResize);
  el.addEventListener('blur', () => vv.removeEventListener('resize', onResize), { once: true });
}

interface Props {
  /** Индекс открытой страницы, с нуля. */
  index: number;
  total: number;
  onIndex: (i: number) => void;
  numbers?: readonly number[];
  /** Для кнопок: «Предыдущая страница». */
  noun?: string;
  /** Для поля: «Номер страницы». */
  nounOf?: string;
}

export function Pager({ index, total, onIndex, numbers, noun = 'страница', nounOf = 'страницы' }: Props) {
  const nums = numbers && numbers.length === total ? numbers : Array.from({ length: total }, (_, i) => i + 1);
  const shown = String(nums[index] ?? index + 1);
  const [draft, setDraft] = useState(shown);
  const editing = useRef(false);
  const id = useId();
  // Сменили страницу кнопками, фильтром или списком — поле показывает новую (если ученик не набирает номер прямо сейчас).
  useEffect(() => {
    if (!editing.current) setDraft(shown);
  }, [shown, total]);
  const commit = () => {
    editing.current = false;
    const i = pageIndexFor(draft, index, nums);
    setDraft(String(nums[i]));
    if (i !== index) onIndex(i);
  };
  const step = (i: number) => {
    editing.current = false;
    onIndex(Math.min(total - 1, Math.max(0, i)));
  };
  const plain = plainNumbers(nums);
  return (
    <div className="pager" role="group" aria-label={`Листать: ${noun}`}>
      <button type="button" className="icon-btn bordered pager-btn" aria-label={`Предыдущая ${noun}`} disabled={index <= 0} onClick={() => step(index - 1)}>
        <Icon name="left" />
      </button>
      <label className="pager-field" htmlFor={id}>
        <input
          id={id}
          className="input pager-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="go"
          autoComplete="off"
          maxLength={9}
          aria-label={`Номер ${nounOf}, ${plain ? `всего ${total}` : `от ${nums[0]} до ${nums[nums.length - 1]}`}`}
          value={draft}
          onFocus={(e) => {
            editing.current = true;
            e.currentTarget.select();
            // Экранная клавиатура появляется не сразу: когда видимая часть окна уменьшится, поле должно остаться на виду.
            keepVisible(e.currentTarget);
          }}
          onChange={(e) => {
            editing.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              // Esc сначала отменяет набранное (окно не закрывается); пустое изменение — пропускаем дальше.
              if (draft !== shown) {
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
              }
              editing.current = false;
              setDraft(shown);
            }
          }}
        />
        <span className="pager-total">{plain ? `из ${total}` : `· ${index + 1} из ${total}`}</span>
      </label>
      <button type="button" className="icon-btn bordered flip pager-btn" aria-label={`Следующая ${noun}`} disabled={index >= total - 1} onClick={() => step(index + 1)}>
        <Icon name="left" />
      </button>
    </div>
  );
}
