// Окно «Файл изменений»: выбрать файл (или вставить ответ нейросети) → посмотреть, что поменяется → применить.
import { useMemo, useRef, useState } from 'react';
import { aiInstructions, exportChanges, packToText, parseChangeFile, planChanges, revertChanges, type ChangePack, type Plan } from '../changes';
import { downloadFile } from '../share';
import { getData, replaceData } from '../store';
import { Icon, Modal, toast } from './ui';

/** Предмет или тема — файлом для нейросети (картинки заменены короткими подписями, потом вернутся). */
export function exportForAi(scope: { subjectId?: string; topicId?: string }) {
  const pack = exportChanges(getData(), scope);
  const name = (pack.title ?? 'Мнема').replace(/[«»"<>:/\\|?*]/g, '').trim();
  downloadFile(`${name} — для нейросети.json`, packToText(pack));
  toast('Файл сохранён. Отдай его нейросети вместе с инструкцией — «Настройки → Данные → Инструкция».', { label: 'Инструкция', run: () => openChanges('#guide') });
}

/** Открыть окно из любого места (настройки, поиск, перетаскивание файла). */
export function openChanges(text?: string) {
  window.dispatchEvent(new CustomEvent('mnema:changes', { detail: text ?? '' }));
}

/** initial: текст файла; '#guide' — сразу открыть «Как попросить нейросеть». */
export function ChangesDialog({ initial = '', onClose }: { initial?: string; onClose: () => void }) {
  const openGuide = initial === '#guide';
  const [text, setText] = useState(openGuide ? '' : initial);
  // Файл перетащили в окно — сразу разбираем (без setState во время отрисовки).
  const [first] = useState(() => (initial && !openGuide ? parseChangeFile(initial) : null));
  const [pack, setPack] = useState<ChangePack | null>(first?.ok ? first.pack : null);
  const [plan, setPlan] = useState<Plan | null>(() => (first?.ok ? planChanges(getData(), first.pack) : null));
  const [error, setError] = useState(first && !first.ok ? first.error : '');
  const [guide, setGuide] = useState(openGuide);
  const fileRef = useRef<HTMLInputElement>(null);

  function check(t: string): Plan | null {
    const r = parseChangeFile(t);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setError('');
    setPack(r.pack);
    return planChanges(getData(), r.pack);
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    const t = await f.text();
    setText(t);
    setPlan(check(t));
  }

  function apply() {
    if (!plan || !pack) return;
    // Считаем заново на текущих данных: пока окно было открыто, могла пройти синхронизация.
    const before = getData();
    const fresh = planChanges(before, pack);
    replaceData(fresh.data);
    onClose();
    const n = fresh.lines.length;
    // «Вернуть» отменяет только сделанное файлом — то, что поменялось потом, остаётся.
    toast(`Готово: ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'изменение' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'изменения' : 'изменений'}`, { label: 'Вернуть', run: () => replaceData(revertChanges(before, fresh.data, getData())) });
  }

  if (guide) return <GuideDialog onBack={() => setGuide(false)} onClose={onClose} />;

  return (
    <Modal title="Файл изменений" onClose={onClose} width={620}>
      {!plan ? (
        <div className="stack gap12">
          <p className="small muted" style={{ margin: 0 }}>
            Файл изменений может создать и поменять что угодно: папки, предметы, темы и конспекты, карточки, словари и термины, правила, стихи, домашку, расписание. Его легко попросить у нейросети — нажми «Как попросить нейросеть».
          </p>
          <div className="row gap8 wrap">
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Выбрать файл
            </button>
            <button className="btn" onClick={() => setGuide(true)}>
              <Icon name="bot" size={16} /> Как попросить нейросеть
            </button>
            <input ref={fileRef} type="file" accept=".json,.txt,.md,application/json,text/plain" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
          <label className="field">
            <span>…или вставь сюда ответ нейросети</span>
            <textarea className="input changes-text" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"changes": [ … ]}' rows={6} />
          </label>
          {error && <span className="small hint warn">{error}</span>}
          <div className="row end gap8">
            <button className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" disabled={!text.trim()} onClick={() => setPlan(check(text))}>
              Посмотреть изменения
            </button>
          </div>
        </div>
      ) : (
        <PlanView plan={plan} onBack={() => setPlan(null)} onApply={apply} />
      )}
    </Modal>
  );
}

function PlanView({ plan, onBack, onApply }: { plan: Plan; onBack: () => void; onApply: () => void }) {
  const counts = useMemo(() => ({ add: plan.lines.filter((l) => l.kind === 'add').length, edit: plan.lines.filter((l) => l.kind === 'edit').length, del: plan.lines.filter((l) => l.kind === 'del').length }), [plan]);
  return (
    <div className="stack gap12">
      {plan.title && <strong>{plan.title}</strong>}
      <div className="row gap8 wrap small">
        {counts.add > 0 && <span className="chg-chip add">+ {counts.add} новое</span>}
        {counts.edit > 0 && <span className="chg-chip edit">✎ {counts.edit} изменено</span>}
        {counts.del > 0 && <span className="chg-chip del">− {counts.del} удалено</span>}
        {!plan.lines.length && <span className="muted">Ничего не поменяется — всё уже так.</span>}
      </div>
      <ul className="chg-list">
        {plan.lines.map((l, i) => (
          <li key={i} className={'chg-' + l.kind}>
            <span className="chg-mark">{l.kind === 'add' ? '+' : l.kind === 'edit' ? '✎' : '−'}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      {plan.warnings.length > 0 && (
        <div className="chg-warn small">
          <strong>Пропущено:</strong>
          <ul>
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {counts.del > 0 && <span className="small muted">Удалённое можно вернуть кнопкой «Вернуть» сразу после применения.</span>}
      <div className="row end gap8">
        <button className="btn ghost" onClick={onBack}>
          Назад
        </button>
        <button className="btn primary" disabled={!plan.lines.length} onClick={onApply}>
          Применить
        </button>
      </div>
    </div>
  );
}

/** Как попросить нейросеть: готовая инструкция, которую надо вставить в чат вместе со своей просьбой. */
function GuideDialog({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [withList, setWithList] = useState(true);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => aiInstructions(getData(), withList), [withList]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Modal title="Как попросить нейросеть" onClose={onClose} width={620}>
      <div className="stack gap12">
        <ol className="steps small" style={{ margin: 0 }}>
          <li>Нажми «Скопировать инструкцию» и вставь её в чат с нейросетью (ChatGPT, Claude, GigaChat, Алиса…).</li>
          <li>Ниже напиши, что нужно. Например: «Сделай тему „§12 Фотосинтез“ по биологии: конспект, 10 карточек и термины» или приложи фото параграфа.</li>
          <li>Сохрани ответ в файл (или просто скопируй) и загрузи его здесь — Мнема покажет, что поменяется.</li>
        </ol>
        <label className="row gap8 small">
          <input type="checkbox" checked={withList} onChange={(e) => setWithList(e.target.checked)} /> Добавить список моих предметов и тем — чтобы нейросеть правила их, а не создавала заново
        </label>
        <textarea className="input changes-text" readOnly value={text} rows={8} />
        <span className="small muted">Хочешь, чтобы нейросеть поправила уже готовое? В меню «⋯» предмета или темы — «Выгрузить для нейросети»: отдай этот файл вместе с инструкцией.</span>
        <div className="row end gap8">
          <button className="btn ghost" onClick={onBack}>
            Назад
          </button>
          <button className="btn primary" onClick={() => void copy()}>
            <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Скопировано' : 'Скопировать инструкцию'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
