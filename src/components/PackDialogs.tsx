// Файл Refrain .mnema (1.32): сохранить всё, предмет или тему (по желанию — с паролем) и открыть файл с паролем.
import { useEffect, useState } from 'react';
import { buildPack, importPack, packTopics, readPack, shareOrSave, type PackScope } from '../mnemaPack';
import { useData } from '../store';
import type { Route } from '../types';
import { Modal, Segmented, Switch, toast } from './ui';

/** «Сохранить файлом»: что войдёт, пароль, и в один тап — «Поделиться» на телефоне или сохранение. */
export function PackExportDialog({ initial, onClose }: { initial?: PackScope; onClose: () => void }) {
  const data = useData();
  const [scope, setScope] = useState<PackScope>(initial ?? { kind: 'all' });
  const [usePass, setUsePass] = useState(false);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const topics = packTopics(data, scope);
  const cards = data.cards.filter((c) => topics.some((t) => t.id === c.topicId)).length;
  const firstSubject = data.subjects[0]?.id ?? '';

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const f = await buildPack(data, scope, usePass ? pass : '');
      const ok = await shareOrSave(f.name, f.text);
      if (ok) {
        toast(`Готово: «${f.name}» — тем: ${f.topics}, карточек: ${f.cards}.`);
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Сохранить файлом Refrain" onClose={onClose} width={480} sticky={busy}>
      <div className="stack gap12" data-part="pack-export">
        <span className="small muted">Файл .mnema — конспекты, словари и карточки, без твоего прогресса. Его можно открыть на другом устройстве или отправить другу.</span>
        {initial?.kind !== 'topic' && (
          <Segmented<'all' | 'subject'>
            ariaLabel="Что сохранить"
            value={scope.kind === 'subject' ? 'subject' : 'all'}
            options={[
              { value: 'all', label: 'Всё' },
              { value: 'subject', label: 'Один предмет' }
            ]}
            onChange={(v) => setScope(v === 'all' ? { kind: 'all' } : { kind: 'subject', id: scope.kind === 'subject' ? scope.id : firstSubject })}
          />
        )}
        {scope.kind === 'subject' && (
          <label className="field">
            <span>Предмет</span>
            <select className="input" value={scope.id} onChange={(e) => setScope({ kind: 'subject', id: e.target.value })}>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="small" aria-live="polite">
          Войдёт: тем — {topics.length}, карточек — {cards}.
        </span>
        <div className="row gap8">
          <span className="grow small">Защитить паролем</span>
          <Switch label="Пароль" checked={usePass} onChange={setUsePass} />
        </div>
        {usePass && (
          <label className="field">
            <span className="small">Пароль (без него файл не открыть — скажи его тому, кому отправляешь)</span>
            <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        {err && <div className="hint warn" role="alert">{err}</div>}
        <div className="row gap8 end">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy || !topics.length || (usePass && pass.length < 4)} onClick={() => void save()}>
            {busy ? 'Готовлю…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Открытие файла .mnema откуда угодно (событие mnema:pack): спросить пароль, если файл зашифрован, и добавить темы. */
export function PackHost({ go }: { go: (r: Route) => void }) {
  const [pending, setPending] = useState<{ text: string; name: string } | null>(null);
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  const open = async (text: string, password = '', name = '') => {
    const r = await readPack(text, password);
    if (!r.ok && 'needPassword' in r) {
      setPending((p) => p ?? { text, name });
      return;
    }
    if (!r.ok) {
      if (password) return setErr(r.error);
      setPending(null);
      return toast('Не получилось открыть файл: ' + r.error);
    }
    setPending(null);
    setPass('');
    setErr('');
    const added = importPack(r.items);
    toast(r.items.length === 1 ? `Добавлена тема «${r.items[0].topic.name}» — ${added.cards} карточек` : `Добавлено тем: ${added.topics}, карточек: ${added.cards}`);
    if (added.firstTopicId) go({ name: 'topic', id: added.firstTopicId });
  };

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; name: string }>).detail;
      setErr('');
      setPending(null);
      void open(d.text, '', d.name);
    };
    window.addEventListener('mnema:pack', h);
    return () => window.removeEventListener('mnema:pack', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pending) return null;
  return (
    <Modal title="Файл защищён паролем" onClose={() => setPending(null)} width={420}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          void open(pending.text, pass);
        }}
      >
        <span className="small muted">{pending.name ? `«${pending.name}» ` : 'Этот файл '}зашифрован. Введи пароль, который тебе сказали вместе с файлом.</span>
        <input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Пароль файла" autoComplete="off" />
        {err && <span className="small warn-text" role="alert">{err}</span>}
        <div className="row gap8 end">
          <button type="button" className="btn" onClick={() => setPending(null)}>
            Отмена
          </button>
          <button className="btn primary" type="submit" disabled={!pass}>
            Открыть
          </button>
        </div>
      </form>
    </Modal>
  );
}
