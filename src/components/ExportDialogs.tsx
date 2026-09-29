// Экспорт в Anki и печать карточек.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildPrompt, itemOrds } from '../srs';
import { downloadBytes } from '../share';
import { sortedSubjects, topicWithDescendants, useData } from '../store';
import type { Card } from '../types';
import { Markdown } from './Markdown';
import { Modal, plural, Segmented, Switch } from './ui';

export function AnkiExportDialog({ onClose, subjectId }: { onClose: () => void; subjectId?: string }) {
  const data = useData();
  const subjects = sortedSubjects(data);
  const [picked, setPicked] = useState<string[]>(subjectId ? [subjectId] : subjects.map((s) => s.id));
  const [progress, setProgress] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const count = data.cards.filter((c) => {
    const t = data.topics.find((x) => x.id === c.topicId);
    return t && picked.includes(t.subjectId);
  }).length;

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const [{ loadSql }, { buildApkg }] = await Promise.all([import('../ankiSql'), import('../ankiExport')]);
      const SQL = await loadSql();
      const r = await buildApkg(data, SQL, { subjectIds: picked, progress });
      const name = `Мнема ${new Date().toISOString().slice(0, 10)}.apkg`;
      const ok = await downloadBytes(name, r.bytes, 'application/octet-stream');
      setMsg(ok ? { ok: true, text: `Готово: ${r.notes} ${plural(r.notes, 'карточка', 'карточки', 'карточек')} в файле «${name}». Открой его в Anki: «Файл → Импорт» или просто двойным щелчком.` } : { ok: false, text: 'Сохранение отменено.' });
    } catch (e) {
      setMsg({ ok: false, text: 'Не получилось: ' + (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <Modal title="Экспорт в Anki" onClose={onClose} width={560}>
      <div className="stack gap12">
        <p className="small muted">Получится файл .apkg: каждый предмет и тема станут колодами «Мнема::Предмет::Тема». Формулы, жирный и пропуски сохранятся.</p>
        <div className="stack gap6">
          {subjects.map((s) => (
            <label key={s.id} className="row gap8 check-row">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />
              <span className="dot" style={{ background: s.color }} /> {s.name}
            </label>
          ))}
        </div>
        <div className="row gap12">
          <span className="grow">
            Перенести прогресс повторений
            <span className="small muted block">Выученные карточки вернутся в Anki тогда же, когда вернулись бы в Мнеме.</span>
          </span>
          <Switch label="Перенести прогресс" checked={progress} onChange={setProgress} />
        </div>
        {msg && <div className={'hint ' + (msg.ok ? 'ok' : 'warn')}>{msg.text}</div>}
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn primary" disabled={!count || busy} onClick={() => void run()}>
            {busy ? 'Собираю…' : `Сохранить ${count} ${plural(count, 'карточку', 'карточки', 'карточек')}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

type PrintLayout = 'cut' | 'list';

/** Печать карточек: для вырезания (с двух сторон) или списком «вопрос — ответ». */
export function PrintDialog({ onClose, topicId, subjectId }: { onClose: () => void; topicId?: string; subjectId?: string }) {
  const data = useData();
  const [layout, setLayout] = useState<PrintLayout>('cut');
  const [printing, setPrinting] = useState(false);
  const items = useMemo(() => {
    const ids = topicId ? topicWithDescendants(data, topicId) : new Set(data.topics.filter((t) => !subjectId || t.subjectId === subjectId).map((t) => t.id));
    const cards = data.cards.filter((c) => ids.has(c.topicId));
    const out: { q: string; a: string; topic: string }[] = [];
    for (const c of cards as Card[]) {
      const topic = data.topics.find((t) => t.id === c.topicId)?.name ?? '';
      for (const o of itemOrds(c)) {
        const p = buildPrompt(c, o, 1);
        out.push({ q: p.question, a: p.answer, topic });
      }
    }
    return out;
  }, [data, topicId, subjectId]);
  useEffect(() => () => document.documentElement.classList.remove('printing'), []);
  const title = topicId ? data.topics.find((t) => t.id === topicId)?.name : subjectId ? data.subjects.find((s) => s.id === subjectId)?.name : 'Все карточки';

  function print() {
    setPrinting(true);
    document.documentElement.classList.add('printing');
    // даём формулам отрисоваться
    setTimeout(() => {
      const done = () => {
        document.documentElement.classList.remove('printing');
        setPrinting(false);
      };
      if (window.mnemaApi?.print) {
        // На телефоне печать идёт в фоне — страницу для печати оставляем, пока окно открыто.
        window.mnemaApi.print();
      } else {
        window.print();
        done();
      }
    }, 300);
  }

  const pages: { q: string; a: string; topic: string }[][] = [];
  for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8));

  return (
    <Modal title="Распечатать карточки" onClose={onClose} width={560}>
      <div className="stack gap12">
        <p className="small muted">
          «{title}» — {items.length} {plural(items.length, 'карточка', 'карточки', 'карточек')}.
        </p>
        <Segmented
          ariaLabel="Как печатать"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'cut', label: 'Для вырезания' },
            { value: 'list', label: 'Списком' }
          ]}
        />
        <p className="small muted">
          {layout === 'cut'
            ? 'По 8 карточек на листе: сначала страница с вопросами, потом с ответами (зеркально). Печатай с двух сторон с переворотом по длинной стороне — ответ окажется на обороте своего вопроса.'
            : 'Таблица «вопрос — ответ»: закрой правую колонку листком и проверяй себя.'}
        </p>
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn primary" disabled={!items.length || printing} onClick={print}>
            Печать
          </button>
        </div>
      </div>
      {printing &&
        createPortal(
          <div id="print-root" className={'print-' + layout}>
            {layout === 'list' ? (
              <table className="print-list">
                <thead>
                  <tr>
                    <th>Вопрос</th>
                    <th>Ответ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <Markdown text={it.q} />
                      </td>
                      <td>
                        <Markdown text={it.a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              pages.map((pg, i) => (
                <div key={i}>
                  <div className="print-page">
                    {pg.map((it, j) => (
                      <div key={j} className="print-card">
                        <span className="print-topic">{it.topic}</span>
                        <Markdown text={it.q} />
                      </div>
                    ))}
                  </div>
                  <div className="print-page backs">
                    {/* оборот: в каждой строке карточки меняются местами, чтобы совпасть при печати с двух сторон */}
                    {[0, 1, 2, 3].flatMap((row) => [pg[row * 2 + 1], pg[row * 2]]).map((it, j) => (
                      <div key={j} className="print-card">
                        {it && <Markdown text={it.a} />}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>,
          document.body
        )}
    </Modal>
  );
}
