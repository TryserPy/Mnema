// Импорт из папки Markdown, хранилища Obsidian или zip-архива (например, «Всё в папку Markdown» из этого же приложения).
// Работает везде, где есть выбор файла: Windows, Android, браузер. Файлы только читаются.
import { useRef, useState } from 'react';
import { packFromEntries, packFromZip, planImport, LIMITS, type ImportPlan } from '../mdImport';
import { importTree, useData } from '../store';
import { Modal, plural } from './ui';

const READ_EXT = /\.(md|png|jpe?g|gif|webp|svg)$/i;

export function MarkdownImport({ onClose, onDone }: { onClose: () => void; onDone: (firstTopicId?: string) => void }) {
  const data = useData();
  const [plan, setPlan] = useState<{ plan: ImportPlan; name: string } | null>(null);
  const [target, setTarget] = useState('__new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  async function load(files: File[], kind: 'files' | 'dir') {
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      let pack;
      let name = 'Импорт';
      const zip = files.length === 1 && /\.zip$/i.test(files[0].name) ? files[0] : null;
      if (zip) {
        if (zip.size > LIMITS.totalBytes) throw new Error('Архив слишком большой');
        name = zip.name.replace(/\.zip$/i, '');
        pack = await packFromZip(new Uint8Array(await zip.arrayBuffer()));
      } else {
        const rel = (f: File) => (kind === 'dir' ? ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name) : f.name);
        if (kind === 'dir') name = ((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '').split('/')[0] || name;
        const entries: { path: string; bytes: Uint8Array }[] = [];
        for (const f of files) {
          if (!READ_EXT.test(f.name) || f.size > LIMITS.noteBytes) continue;
          const path = kind === 'dir' ? rel(f).split('/').slice(1).join('/') : rel(f);
          entries.push({ path, bytes: new Uint8Array(await f.arrayBuffer()) });
        }
        pack = packFromEntries(entries);
      }
      const p = planImport(pack, { fallbackName: name });
      if (!p.topics.length) throw new Error('В выбранном нет заметок .md');
      setPlan({ plan: p, name });
    } catch (e) {
      setError((e as Error).message || 'Не получилось прочитать');
      setPlan(null);
    }
    setBusy(false);
  }

  function run() {
    if (!plan) return;
    setBusy(true);
    try {
      const r = importTree(plan.plan, target === '__new' ? undefined : target);
      onDone(r.firstTopicId);
    } catch (e) {
      setError('Не получилось: ' + (e as Error).message);
      setBusy(false);
    }
  }

  const st = plan?.plan.stats;
  return (
    <Modal title="Импорт из папки Markdown" onClose={onClose} width={560} sticky={busy}>
      <div className="stack gap12">
        <p className="small muted">
          Подойдёт архив .zip из «Экспорт → Всё в Markdown», папка с заметками (в том числе хранилище Obsidian) или отдельные файлы .md. Папки станут папками и предметами, файлы — темами, картинки и формулы переносятся, карточки из раздела «Карточки» тоже. Файлы только читаются.
        </p>
        <div className="row gap8">
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            Выбрать .zip или .md
          </button>
          <button className="btn" disabled={busy} onClick={() => dirRef.current?.click()}>
            Выбрать папку
          </button>
        </div>
        <input ref={fileRef} type="file" hidden multiple accept=".zip,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,application/zip,text/markdown" onChange={(e) => void load([...(e.target.files ?? [])], 'files').then(() => (e.target.value = ''))} />
        <input
          ref={dirRef}
          type="file"
          hidden
          multiple
          // @ts-expect-error webkitdirectory есть в Chromium (Windows, Android, браузер), но не в типах React
          webkitdirectory=""
          onChange={(e) => void load([...(e.target.files ?? [])], 'dir').then(() => (e.target.value = ''))}
        />
        {busy && !plan && <span className="small muted">Читаю…</span>}
        {st && plan && (
          <div className="stack gap8">
            <div className="hint ok">
              «{plan.name}»: {st.notes} {plural(st.notes, 'заметка', 'заметки', 'заметок')}, предметов: {st.subjects}
              {st.folders ? `, папок: ${st.folders}` : ''}, карточек: {st.cards}, картинок: {st.images}.
            </div>
            {plan.plan.warnings.length > 0 && (
              <div className="hint warn">
                {plan.plan.warnings.slice(0, 5).map((w) => (
                  <div key={w}>{w}</div>
                ))}
                {plan.plan.warnings.length > 5 && <div>…и ещё {plan.plan.warnings.length - 5}</div>}
              </div>
            )}
            <label className="row gap8">
              <span className="small muted">Куда</span>
              <select className="input grow" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="__new">Папки и предметы как в файлах (создать, если нет)</option>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    Всё в предмет «{s.name}»
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {error && <div className="hint warn">{error}</div>}
        <div className="row end gap8">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button className="btn primary" disabled={!plan || busy} onClick={run}>
            {busy && plan ? 'Импортирую…' : 'Импортировать'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
