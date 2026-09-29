import { useEffect, useState } from 'react';
import { cloudSync, type CloudSettings } from '../cloud';
import { reportText } from '../sync';
import { updateSettings, useData } from '../store';
import { Modal, Switch } from './ui';

const PRESETS = [
  { name: 'Яндекс Диск', url: 'https://webdav.yandex.ru', hint: 'Пароль — не обычный, а «пароль приложения»: Яндекс ID → Безопасность → Пароли приложений → «Файлы».' },
  { name: 'Nextcloud / другой WebDAV', url: 'https://', hint: 'Адрес WebDAV есть в настройках твоего облака.' }
];

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const api = window.mnemaApi;
  const saved = data.settings.cloud;
  const [c, setC] = useState<CloudSettings>(saved ?? { url: PRESETS[0].url, user: '', folder: 'Mnema', encrypt: false, auto: true });
  const [pass, setPass] = useState('');
  const [encPass, setEncPass] = useState('');
  const [hasPass, setHasPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const preset = PRESETS.find((p) => p.url === c.url) ?? PRESETS[1];

  useEffect(() => {
    void api?.secretGet?.('cloud-pass').then((p) => setHasPass(Boolean(p)));
    void api?.secretGet?.('cloud-enc').then((p) => setEncPass(p));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api?.http || !api.secretGet) {
    return (
      <Modal title="Облачная копия" onClose={onClose}>
        <p>Облако работает в приложении Мнема для Windows и Android.</p>
      </Modal>
    );
  }

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      if (pass) await api!.secretSet!('cloud-pass', pass);
      await api!.secretSet!('cloud-enc', c.encrypt ? encPass : '');
      const p = pass || (await api!.secretGet!('cloud-pass'));
      if (!p) throw new Error('Введи пароль от облака.');
      updateSettings({ cloud: c });
      const r = await cloudSync(c, p, c.encrypt ? encPass : '', (t) => setMsg({ ok: true, text: t }));
      setHasPass(true);
      setPass('');
      setMsg({ ok: true, text: `Готово: копия в облаке обновлена (${Math.round(r.uploadedBytes / 1024)} КБ). ${r.report ? reportText(r.report) : 'Это первая копия.'}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const set = (p: Partial<CloudSettings>) => setC({ ...c, ...p });
  return (
    <Modal title="Облачная копия" onClose={onClose} width={560} sticky={busy}>
      <div className="stack gap12">
        <p className="small muted">Мнема хранит копию в твоём облаке и объединяет её с данными на каждом устройстве. Так и телефон, и компьютер всегда будут с одинаковыми карточками — даже без общей сети Wi-Fi.</p>
        <label className="field">
          <span>Облако</span>
          <select className="input" value={preset.name} onChange={(e) => set({ url: PRESETS.find((p) => p.name === e.target.value)!.url })}>
            {PRESETS.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <span className="small muted">{preset.hint}</span>
        </label>
        {preset.name !== 'Яндекс Диск' && (
          <label className="field">
            <span>Адрес WebDAV</span>
            <input className="input mono" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://cloud.example.com/remote.php/dav/files/имя" />
          </label>
        )}
        <label className="field">
          <span>Логин</span>
          <input className="input" value={c.user} onChange={(e) => set({ user: e.target.value.trim() })} placeholder={preset.name === 'Яндекс Диск' ? 'логин Яндекса (без @yandex.ru)' : ''} autoComplete="off" />
        </label>
        <label className="field">
          <span>Пароль {hasPass && <span className="muted">(сохранён — впиши новый, чтобы заменить)</span>}</span>
          <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>Папка в облаке</span>
          <input className="input" value={c.folder} onChange={(e) => set({ folder: e.target.value })} />
        </label>
        <div className="row gap8">
          <span className="grow small">Шифровать паролем — в облаке будет только шифр</span>
          <Switch label="Шифровать" checked={c.encrypt} onChange={(v) => set({ encrypt: v })} />
        </div>
        {c.encrypt && (
          <label className="field">
            <span>Пароль шифрования (одинаковый на всех устройствах; если забудешь — копию не открыть)</span>
            <input className="input" type="password" value={encPass} onChange={(e) => setEncPass(e.target.value)} autoComplete="off" />
          </label>
        )}
        <div className="row gap8">
          <span className="grow small">Синхронизировать автоматически (при запуске и каждые 30 минут)</span>
          <Switch label="Автоматически" checked={c.auto} onChange={(v) => set({ auto: v })} />
        </div>
        {saved?.lastAt && <span className="small muted">Последний раз: {new Date(saved.lastAt).toLocaleString('ru-RU')}</span>}
        {msg && <div className={'hint ' + (msg.ok ? (busy ? '' : 'ok') : 'warn')}>{msg.text}</div>}
        <div className="row gap8">
          {saved && (
            <button
              className="btn ghost danger small"
              onClick={async () => {
                updateSettings({ cloud: null });
                await api!.secretSet!('cloud-pass', '');
                await api!.secretSet!('cloud-enc', '');
                onClose();
              }}
            >
              Отключить облако
            </button>
          )}
          <span className="grow" />
          <button className="btn primary" disabled={busy || !c.user || !/^https:\/\/.+\..+|^http:\/\/(127\.0\.0\.1|localhost)/.test(c.url)} onClick={() => void run()}>
            {busy ? 'Синхронизирую…' : 'Синхронизировать сейчас'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
