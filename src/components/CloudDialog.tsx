import { useEffect, useRef, useState } from 'react';
import { CloudError, cloudSync, type CloudSettings } from '../cloud';
import { reportText } from '../sync';
import { updateSettings, useData } from '../store';
import { newState, parseYandexToken, yandexAuthUrl, yandexClientId } from '../yandexDisk';
import { Modal, Segmented, Switch } from './ui';

const PRESETS = [
  { name: 'Nextcloud / другой WebDAV', url: 'https://', hint: 'Адрес WebDAV есть в настройках твоего облака.' },
  { name: 'Яндекс Диск по WebDAV (платный тариф)', url: 'https://webdav.yandex.ru', hint: 'Только для платного Яндекс 360: на бесплатном тарифе Яндекс отвечает ошибкой 402. Пароль — «пароль приложения»: Яндекс ID → Безопасность → Пароли приложений → «Файлы».' }
];

type Kind = 'yandex' | 'webdav';

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const api = window.mnemaApi;
  const saved = data.settings.cloud;
  const clientId = yandexClientId();
  const [c, setC] = useState<CloudSettings>(saved ?? { kind: clientId ? 'yandex' : 'webdav', url: PRESETS[0].url, user: '', folder: 'Refrain', encrypt: false, auto: true });
  const kind: Kind = c.kind === 'yandex' ? 'yandex' : 'webdav';
  const [pass, setPass] = useState('');
  const [encPass, setEncPass] = useState('');
  const [hasPass, setHasPass] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const state = useRef(newState());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  const preset = PRESETS.find((p) => p.url === c.url) ?? PRESETS[0];

  useEffect(() => {
    void api?.secretGet?.('cloud-pass').then((p) => setHasPass(Boolean(p)));
    void api?.secretGet?.('cloud-yandex').then((p) => setHasToken(Boolean(p)));
    void api?.secretGet?.('cloud-enc').then((p) => setEncPass(p));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api?.http || !api.secretGet) {
    return (
      <Modal title="Облачная копия" onClose={onClose}>
        <p>Облако работает в приложении Refrain для Windows, Linux и Android.</p>
      </Modal>
    );
  }

  const set = (p: Partial<CloudSettings>) => setC({ ...c, ...p });

  async function run(next: CloudSettings = c) {
    setBusy(true);
    setMsg(null);
    try {
      if (next.kind !== 'yandex' && pass) await api!.secretSet!('cloud-pass', pass);
      await api!.secretSet!('cloud-enc', next.encrypt ? encPass : '');
      const secret = next.kind === 'yandex' ? await api!.secretGet!('cloud-yandex') : pass || (await api!.secretGet!('cloud-pass'));
      if (!secret) throw new Error(next.kind === 'yandex' ? 'Сначала войди через Яндекс.' : 'Введи пароль от облака.');
      updateSettings({ cloud: next });
      const r = await cloudSync(next, secret, next.encrypt ? encPass : '', (t) => setMsg({ ok: true, text: t }));
      if (next.kind !== 'yandex') setHasPass(true);
      setPass('');
      setMsg({ ok: true, text: `Готово: копия в облаке обновлена (${Math.round(r.uploadedBytes / 1024)} КБ). ${r.report ? reportText(r.report) : 'Это первая копия.'}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message, code: e instanceof CloudError ? e.code : (e as { code?: string }).code });
    } finally {
      setBusy(false);
    }
  }

  /** Токен получен: сохранить (зашифрованным) и сразу синхронизировать. */
  async function gotToken(raw: string) {
    const token = parseYandexToken(raw, state.current);
    if (!token) return setMsg({ ok: false, text: 'Это не похоже на ссылку или код со страницы Яндекса. Скопируй адрес страницы целиком.' });
    await api!.secretSet!('cloud-yandex', token);
    setHasToken(true);
    setPaste(null);
    const next = { ...c, kind: 'yandex' as const };
    setC(next);
    await run(next);
  }

  async function yandexLogin() {
    setMsg(null);
    const url = yandexAuthUrl(clientId, state.current);
    if (api!.yandexLogin) {
      const back = await api!.yandexLogin(url);
      if (back) await gotToken(back);
      return;
    }
    // Телефон и браузер: страница Яндекса открывается отдельно, ученик возвращается и вставляет ссылку.
    window.open(url, '_blank', 'noopener,noreferrer');
    setPaste('');
  }

  async function yandexLogout() {
    await api!.secretSet!('cloud-yandex', '');
    setHasToken(false);
    setMsg({ ok: true, text: 'Яндекс Диск отключён на этом устройстве. Копия на Диске осталась.' });
  }

  return (
    <Modal title="Облачная копия" onClose={onClose} width={560} sticky={busy}>
      <div className="stack gap12">
        <p className="small muted">Копия в твоём облаке объединяется с данными на каждом устройстве — телефон и компьютер с одинаковыми карточками, даже без общей сети Wi-Fi.</p>
        {api.platform === 'web' && <p className="hint small">В браузере облако работает не со всеми серверами. Если облако не отвечает, используй приложение для Windows, Linux или Android.</p>}
        <Segmented<Kind>
          ariaLabel="Облако"
          value={kind}
          options={[
            { value: 'yandex', label: 'Яндекс Диск' },
            { value: 'webdav', label: 'WebDAV' }
          ]}
          onChange={(v) => {
            setMsg(null);
            set({ kind: v });
          }}
        />

        {kind === 'yandex' ? (
          <div className="stack gap8" data-part="cloud-yandex">
            {!clientId ? (
              <div className="hint warn small">Вход через Яндекс в этой сборке ещё не настроен. Пока можно подключить облако по WebDAV.</div>
            ) : hasToken ? (
              <div className="row gap8 wrap">
                <span className="grow small">
                  ✓ <strong>Яндекс Диск подключён.</strong> Копия лежит в папке «Приложения» на Диске — другие файлы Refrain не видит.
                </span>
                <button className="btn small ghost" disabled={busy} onClick={() => void yandexLogout()}>
                  Отключить
                </button>
              </div>
            ) : (
              <>
                <span className="small muted">Войди в Яндекс и разреши доступ — пароль приложения не нужен. Refrain получит доступ только к своей папке на Диске.</span>
                <button className="btn primary" disabled={busy} onClick={() => void yandexLogin()}>
                  Войти через Яндекс
                </button>
                {paste !== null && (
                  <label className="field">
                    <span className="small">Когда Яндекс покажет страницу с кодом, скопируй адрес этой страницы (или сам код) и вставь сюда:</span>
                    <div className="row gap8">
                      <input className="input grow mono" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://oauth.yandex.ru/verification_code#access_token=…" autoComplete="off" />
                      <button className="btn" disabled={busy || !paste.trim()} onClick={() => void gotToken(paste)}>
                        Готово
                      </button>
                    </div>
                  </label>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <label className="field">
              <span>Сервер</span>
              <select className="input" value={preset.name} onChange={(e) => set({ url: PRESETS.find((p) => p.name === e.target.value)!.url })}>
                {PRESETS.map((p) => (
                  <option key={p.name}>{p.name}</option>
                ))}
              </select>
              <span className="small muted">{preset.hint}</span>
            </label>
            {preset.url === 'https://' && (
              <label className="field">
                <span>Адрес WebDAV</span>
                <input className="input mono" value={c.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://cloud.example.com/remote.php/dav/files/имя" />
              </label>
            )}
            <label className="field">
              <span>Логин</span>
              <input className="input" value={c.user} onChange={(e) => set({ user: e.target.value.trim() })} autoComplete="off" />
            </label>
            <label className="field">
              <span>Пароль {hasPass && <span className="muted">(сохранён — впиши новый, чтобы заменить)</span>}</span>
              <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
            </label>
          </>
        )}

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
          <span className="grow small">Синхронизировать сам (при запуске и каждые 30 минут)</span>
          <Switch label="Автоматически" checked={c.auto} onChange={(v) => set({ auto: v })} />
        </div>
        {saved?.lastAt && <span className="small muted">Последний раз: {new Date(saved.lastAt).toLocaleString('ru-RU')}</span>}
        {msg && (
          <div className={'hint ' + (msg.ok ? (busy ? '' : 'ok') : 'warn')} role="status">
            {msg.text}
            {msg.code === 'webdav_paid' && clientId && (
              <div className="row gap8" style={{ marginTop: 8 }}>
                <button
                  className="btn small primary"
                  onClick={() => {
                    set({ kind: 'yandex' });
                    void yandexLogin();
                  }}
                >
                  Подключить через вход в Яндекс
                </button>
              </div>
            )}
          </div>
        )}
        <div className="row gap8 wrap">
          {saved && (
            <button
              className="btn ghost danger small"
              onClick={async () => {
                updateSettings({ cloud: null });
                await api!.secretSet!('cloud-pass', '');
                await api!.secretSet!('cloud-yandex', '');
                await api!.secretSet!('cloud-enc', '');
                onClose();
              }}
            >
              Отключить облако
            </button>
          )}
          <span className="grow" />
          <button
            className="btn primary"
            disabled={busy || (kind === 'yandex' ? !hasToken : !c.user || !/^https:\/\/.+\..+|^http:\/\/(127\.0\.0\.1|localhost)/.test(c.url))}
            onClick={() => void run()}
          >
            {busy ? 'Синхронизирую…' : 'Синхронизировать сейчас'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

