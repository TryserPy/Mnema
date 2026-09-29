import { useMemo, useState } from 'react';
import { convertObsidian, noteTitle, topFolder } from '../obsidian';
import { importTopics, useData } from '../store';
import { Modal, plural, SUBJECT_COLORS } from './ui';

import type { Vault } from '../store';

export function ObsidianImport({ subjectId, onClose, onDone }: { subjectId?: string; onClose: () => void; onDone: (firstTopicId?: string) => void }) {
  const data = useData();
  const [vault, setVault] = useState<Vault | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(subjectId ?? '__folders');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const api = window.mnemaApi;

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of vault?.files ?? []) {
      if (filter && !f.toLowerCase().includes(filter.toLowerCase())) continue;
      const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
      m.set(dir, [...(m.get(dir) ?? []), f]);
    }
    return [...m.entries()];
  }, [vault, filter]);

  if (!api?.obsidianPick) {
    return (
      <Modal title="Импорт из Obsidian" onClose={onClose}>
        <p>Импорт из Obsidian работает в приложении для Windows.</p>
      </Modal>
    );
  }

  async function pick() {
    setError('');
    const v = await api!.obsidianPick!();
    if (v) {
      setVault(v);
      setSelected(new Set());
    }
  }

  function toggle(f: string) {
    const n = new Set(selected);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    setSelected(n);
  }

  function toggleGroup(files: string[]) {
    const all = files.every((f) => selected.has(f));
    const n = new Set(selected);
    files.forEach((f) => (all ? n.delete(f) : n.add(f)));
    setSelected(n);
  }

  async function run() {
    if (!vault) return;
    setBusy(true);
    setError('');
    try {
      const items = [];
      for (const rel of [...selected]) {
        const { text, images } = await api!.obsidianRead!(rel);
        const folder = topFolder(rel) ?? vault.name;
        items.push({
          subjectName: folder,
          subjectColor: SUBJECT_COLORS[items.length % SUBJECT_COLORS.length],
          topic: { name: noteTitle(rel), note: convertObsidian(text, images), source: `obsidian:${vault.name}/${rel}` }
        });
      }
      const res = importTopics(items, target === '__folders' ? undefined : target);
      onDone(res.firstTopicId);
    } catch (e) {
      setError('Не получилось: ' + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Импорт заметок из Obsidian" onClose={onClose} width={720} sticky={busy}>
      {!vault ? (
        <div className="stack gap12">
          <p>Выбери папку своего хранилища Obsidian (или папку внутри него). Мнема покажет заметки — отметь те, что станут темами. Картинки и формулы переносятся, ссылки [[…]] превращаются в обычный текст.</p>
          <p className="small muted">Мнема только читает файлы и ничего не меняет в хранилище.</p>
          <div className="row end">
            <button className="btn primary" onClick={pick}>
              Выбрать папку…
            </button>
          </div>
        </div>
      ) : (
        <div className="stack gap12">
          <div className="row gap8">
            <strong className="grow">
              {vault.name} · {vault.files.length} {plural(vault.files.length, 'заметка', 'заметки', 'заметок')}
            </strong>
            <button className="btn small ghost" onClick={pick}>
              Другая папка
            </button>
          </div>
          {vault.files.length > 15 && <input className="input" placeholder="Найти заметку" value={filter} onChange={(e) => setFilter(e.target.value)} />}
          <div className="file-tree">
            {groups.map(([dir, files]) => (
              <div key={dir} className="file-group">
                <label className="file-dir">
                  <input type="checkbox" checked={files.every((f) => selected.has(f))} onChange={() => toggleGroup(files)} />
                  <strong>{dir || vault.name}</strong>
                  <span className="muted small">{files.length}</span>
                </label>
                {files.map((f) => (
                  <label key={f} className="file-item">
                    <input type="checkbox" checked={selected.has(f)} onChange={() => toggle(f)} />
                    {noteTitle(f)}
                  </label>
                ))}
              </div>
            ))}
            {groups.length === 0 && <span className="muted small">Заметок не найдено.</span>}
          </div>
          <label className="row gap8">
            <span className="small muted">Куда</span>
            <select className="input grow" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="__folders">Предметы по папкам (создать, если нет)</option>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  В предмет «{s.name}»
                </option>
              ))}
            </select>
          </label>
          {error && <div className="hint warn">{error}</div>}
          <div className="row end gap8">
            <button className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button className="btn primary" disabled={selected.size === 0 || busy} onClick={run}>
              {busy ? 'Импортирую…' : `Импортировать ${selected.size || ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
