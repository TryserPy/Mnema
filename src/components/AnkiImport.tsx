import { useEffect, useRef, useState } from 'react';
import type { AnkiParsed } from '../anki';
import { importTopics, useData } from '../store';
import { Modal, plural, Switch, SUBJECT_COLORS } from './ui';

type Step = { name: 'pick' } | { name: 'reading'; file: string } | { name: 'preview'; file: string; parsed: AnkiParsed } | { name: 'done'; topics: number; cards: number; firstTopicId?: string };

const ACCEPT = '.apkg,.colpkg,.anki2,.anki21,.txt,.tsv,.csv';

/** Импорт колод Anki. Можно передать уже выбранный файл (перетащили в окно). */
export function AnkiImport({ file, onClose, onOpenTopic }: { file?: File; onClose: () => void; onOpenTopic: (id: string) => void }) {
  const data = useData();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [target, setTarget] = useState('__decks');
  const [progress, setProgress] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  async function read(f: File) {
    setError('');
    setStep({ name: 'reading', file: f.name });
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const [{ parseAnki }, { loadSql }] = await Promise.all([import('../anki'), import('../ankiSql')]);
      const SQL = await loadSql();
      // Дать интерфейсу показать «Читаю…» перед тяжёлой работой.
      await new Promise((r) => setTimeout(r, 30));
      const parsed = parseAnki(f.name, bytes, SQL, { progress: true, settings: data.settings });
      if (parsed.decks.length === 0) throw new Error('в файле не нашлось карточек, которые можно перенести');
      setSelected(new Set(parsed.decks.map((_, i) => i)));
      setProgress(parsed.report.withProgress > 0);
      setStep({ name: 'preview', file: f.name, parsed });
    } catch (e) {
      const m = (e as Error).message || String(e);
      setError(/invalid|zip|unexpected|malformed|not a database/i.test(m) ? 'Не похоже на файл Anki. Подойдут .apkg, .colpkg или текстовый экспорт (.txt).' : 'Не получилось: ' + m);
      setStep({ name: 'pick' });
    }
  }

  useEffect(() => {
    if (file && !started.current) {
      started.current = true;
      void read(file);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function run(parsed: AnkiParsed) {
    const { deckTarget } = parsedHelpers;
    const items = parsed.decks
      .filter((_, i) => selected.has(i))
      .map((d, i) => {
        const t = deckTarget(d.path, target === '__decks');
        return {
          subjectName: t.subject,
          subjectColor: SUBJECT_COLORS[(data.subjects.length + i) % SUBJECT_COLORS.length],
          topic: { name: t.topic, note: '', source: 'anki' },
          cards: d.cards.map((c) => (progress ? c : { ...c, states: {}, logs: [] }))
        };
      });
    const r = importTopics(items, target === '__decks' ? undefined : target);
    setStep({ name: 'done', topics: r.topics, cards: r.cards, firstTopicId: r.firstTopicId });
  }

  const busy = step.name === 'reading';

  return (
    <Modal title="Импорт из Anki" onClose={onClose} width={640} sticky={busy}>
      {step.name === 'pick' && (
        <div className="stack gap12">
          <p>Выбери файл, который сохранил в Anki: колоду (.apkg), всю коллекцию (.colpkg) или «Заметки в текстовом виде» (.txt).</p>
          <p className="small muted">Колоды станут темами, картинки и формулы перенесутся. Звук пока не переносится. Файл можно и просто перетащить в окно Мнемы.</p>
          {error && <div className="hint warn">{error}</div>}
          <div className="row end">
            <button className="btn primary" onClick={() => inputRef.current?.click()}>
              Выбрать файл…
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void read(f);
            }}
          />
        </div>
      )}

      {step.name === 'reading' && (
        <div className="stack gap12 center">
          <div className="spinner" aria-hidden />
          <p>Читаю «{step.file}»…</p>
        </div>
      )}

      {step.name === 'preview' && renderPreview()}

      {step.name === 'done' && (
        <div className="stack gap12">
          <div className="hint ok">
            Готово: {step.topics} {plural(step.topics, 'тема', 'темы', 'тем')}, {step.cards} {plural(step.cards, 'карточка', 'карточки', 'карточек')}.
          </div>
          <p className="small muted">Если что-то перенеслось криво — карточку можно поправить в теме, во вкладке «Карточки».</p>
          <div className="row end gap8">
            <button className="btn ghost" onClick={onClose}>
              Закрыть
            </button>
            {step.firstTopicId && (
              <button className="btn primary" onClick={() => onOpenTopic(step.firstTopicId!)}>
                Открыть
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );

  function renderPreview() {
    if (step.name !== 'preview') return null;
    const { parsed } = step;
    const r = parsed.report;
    const chosen = parsed.decks.filter((_, i) => selected.has(i));
    const count = chosen.reduce((a, d) => a + d.cards.length, 0);
    const notes: string[] = [];
    if (r.images) notes.push(`картинок: ${r.images}`);
    if (r.sounds) notes.push(`звук не переносится (${r.sounds})`);
    if (r.missingMedia) notes.push(`не нашлось картинок: ${r.missingMedia}`);
    if (r.skipped) notes.push(`пропущено заметок: ${r.skipped} (например, Image Occlusion)`);
    return (
      <div className="stack gap12">
        <div className="row gap8">
          <strong className="grow clamp1">{step.file}</strong>
          <span className="small muted nowrap">{r.format}</span>
        </div>
        <div className="file-tree">
          {parsed.decks.map((d, i) => {
            const t = parsedHelpers.deckTarget(d.path, target === '__decks');
            return (
              <label key={i} className="file-dir">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => {
                    const n = new Set(selected);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    setSelected(n);
                  }}
                />
                <span className="grow">
                  {target === '__decks' && <span className="muted">{t.subject} › </span>}
                  {t.topic}
                </span>
                <span className="muted small nowrap">
                  {d.cards.length} {plural(d.cards.length, 'карточка', 'карточки', 'карточек')}
                </span>
              </label>
            );
          })}
        </div>
        <label className="row gap8">
          <span className="small muted">Куда</span>
          <select className="input grow" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="__decks">Как в Anki: верхняя колода — предмет, вложенная — тема</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                В предмет «{s.name}»
              </option>
            ))}
          </select>
        </label>
        {r.withProgress > 0 && (
          <div className="row gap12">
            <span className="grow small">
              Перенести прогресс из Anki
              <span className="muted"> — {r.withProgress} {plural(r.withProgress, 'карточка уже изучалась', 'карточки уже изучались', 'карточек уже изучались')}. Если выключить, всё начнётся с нуля.</span>
            </span>
            <Switch label="Перенести прогресс" checked={progress} onChange={setProgress} />
          </div>
        )}
        {notes.length > 0 && <p className="small muted">{notes.join(' · ')}</p>}
        <div className="row end gap8">
          <button className="btn ghost" onClick={() => setStep({ name: 'pick' })}>
            Другой файл
          </button>
          <button className="btn primary" disabled={count === 0} onClick={() => run(parsed)}>
            Добавить {count} {plural(count, 'карточку', 'карточки', 'карточек')}
          </button>
        </div>
      </div>
    );
  }
}

// Держим отдельно от парсера, чтобы не тянуть его в основной бандл.
const parsedHelpers = {
  /** byDecks: верхняя колода — предмет, остальное — тема. Иначе вся колода — тема в выбранном предмете. */
  deckTarget(path: string[], byDecks: boolean) {
    if (!byDecks) return { subject: '', topic: path.join(' › ') };
    return { subject: path[0], topic: path.length > 1 ? path.slice(1).join(' › ') : 'Карточки из Anki' };
  }
};
