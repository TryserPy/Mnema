// Задания пробной контрольной «Соедини пары» и «Расставь по порядку». Всё нажатиями, без перетаскивания — удобно и пальцем.
import { useState } from 'react';
import type { TestQuestion } from '../testgen';
import { Markdown } from './Markdown';
import { Icon } from './ui';

interface Done {
  ok: boolean;
  given?: string;
}

const md = (t: string) => <Markdown className="inline-md" text={t} />;

/** «Соедини пары»: слева вопросы, справа перемешанные ответы. Нажми ответ — он встанет к выделенному вопросу (выделение само идёт дальше). */
export function MatchTask({ q, revealed, onAnswer }: { q: TestQuestion; revealed: boolean; onAnswer: (a: Done) => void }) {
  const pairs = q.pairs!;
  const rights = q.rights!;
  const [link, setLink] = useState<(number | undefined)[]>(() => pairs.map(() => undefined));
  const [sel, setSel] = useState(0);
  const firstFree = (l: (number | undefined)[], from = 0) => {
    for (let k = 0; k < l.length; k++) {
      const i = (from + k) % l.length;
      if (l[i] === undefined) return i;
    }
    return -1;
  };
  const pickRight = (j: number) => {
    const next = link.map((x) => (x === j ? undefined : x));
    next[sel] = j;
    setLink(next);
    const f = firstFree(next, sel + 1);
    if (f >= 0) setSel(f);
  };
  const all = link.every((x) => x !== undefined);
  const check = () => {
    const wrong = pairs.filter((p, i) => rights[link[i]!] !== p.right);
    onAnswer({ ok: wrong.length === 0, given: wrong.map((p) => `${p.left} — ${rights[link[pairs.indexOf(p)]!]}`).join('; ') || undefined });
  };

  if (revealed) {
    return (
      <ul className="mt-result">
        {pairs.map((p, i) => {
          const mine = rights[link[i]!];
          const ok = mine === p.right;
          return (
            <li key={i} className={ok ? 'ok' : 'bad'}>
              <span className="mt-mark">
                <Icon name={ok ? 'check' : 'x'} size={16} />
              </span>
              <span className="mt-line">
                <strong>{md(p.left)}</strong>
                <span className="mt-dash">—</span>
                {ok ? (
                  md(mine)
                ) : (
                  <>
                    <s className="muted">{md(mine)}</s>
                    <span className="mt-fix">{md(p.right)}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <div className="stack gap12">
      <div className="mt-grid">
        <div className="mt-col">
          {pairs.map((p, i) => (
            <button key={i} type="button" className={'mt-item' + (sel === i ? ' sel' : '') + (link[i] !== undefined ? ' c' + i : '')} aria-pressed={sel === i} onClick={() => setSel(i)}>
              <span className="mt-num">{i + 1}</span>
              {md(p.left)}
            </button>
          ))}
        </div>
        <div className="mt-col">
          {rights.map((r, j) => {
            const owner = link.indexOf(j);
            return (
              <button key={j} type="button" className={'mt-item right' + (owner >= 0 ? ' c' + owner : '')} onClick={() => pickRight(j)}>
                <span className="mt-num">{owner >= 0 ? owner + 1 : ''}</span>
                {md(r)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="row between gap8 wrap">
        <span className="small muted">{all ? 'Все пары собраны — проверь.' : `Выбери ответ для «${pairs[sel] ? pairs[sel].left.replace(/[*_`$]/g, '').slice(0, 40) : ''}»`}</span>
        <button type="button" className="btn primary" disabled={!all} onClick={check}>
          Проверить
        </button>
      </div>
    </div>
  );
}

/** «Расставь по порядку»: нажимай пункты по очереди — они встают в «Твой порядок». Нажатие на поставленный — убирает его обратно. */
export function OrderTask({ q, revealed, onAnswer }: { q: TestQuestion; revealed: boolean; onAnswer: (a: Done) => void }) {
  const items = q.shuffled!;
  const steps = q.steps!;
  const [picked, setPicked] = useState<number[]>([]);
  const all = picked.length === items.length;
  const check = () => {
    const mine = picked.map((i) => items[i]);
    onAnswer({ ok: mine.every((x, k) => x === steps[k]), given: mine.map((x, k) => `${k + 1}. ${x}`).join('; ') });
  };
  return (
    <div className="stack gap12">
      <div className="ord-zone">
        <span className="label">Твой порядок</span>
        {picked.length === 0 && <span className="small muted ord-empty">Нажми на то, что идёт первым</span>}
        <ol className="ord-list">
          {picked.map((i, k) => {
            const ok = items[i] === steps[k];
            return (
              <li key={i}>
                <button type="button" className={'ord-item on' + (revealed ? (ok ? ' ok' : ' bad') : '')} disabled={revealed} onClick={() => setPicked(picked.filter((x) => x !== i))}>
                  <span className="ord-num">{k + 1}</span>
                  <span className="grow">{md(items[i])}</span>
                  {revealed && <Icon name={ok ? 'check' : 'x'} size={16} />}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {!revealed && picked.length < items.length && (
        <div className="ord-pool">
          {items.map((x, i) =>
            picked.includes(i) ? null : (
              <button key={i} type="button" className="ord-item" onClick={() => setPicked([...picked, i])}>
                {md(x)}
              </button>
            )
          )}
        </div>
      )}
      {!revealed && (
        <div className="row between gap8 wrap">
          <button type="button" className="link-btn small" disabled={!picked.length} onClick={() => setPicked([])}>
            Начать заново
          </button>
          <button type="button" className="btn primary" disabled={!all} onClick={check}>
            Проверить
          </button>
        </div>
      )}
      {revealed && !picked.every((i, k) => items[i] === steps[k]) && (
        <div className="hint warn ord-right">
          <span>Верный порядок:</span>
          <Markdown text={q.answer} />
        </div>
      )}
    </div>
  );
}
