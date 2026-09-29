// Установка новой версии: скачать → поставить. Одинаково в настройках («О Мнеме») и в окне,
// которое открывается из уведомления «Вышла Мнема X».
import { useEffect, useRef, useState } from 'react';
import type { UpdateInfo } from '../update';
import { Modal } from './ui';

type Phase = 'idle' | 'downloading' | 'ready' | 'permission' | 'installing' | 'error';

function mb(bytes?: number): string {
  return bytes ? ` · ${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ` : '';
}

export function UpdateFlow({ info }: { info: UpdateInfo }) {
  const api = window.mnemaApi;
  const android = api?.platform === 'android';
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(
    () =>
      api?.onUpdateEvent?.((e) => {
        if (e.type === 'progress') {
          setPercent(e.percent);
          if (phaseRef.current === 'idle') setPhase('downloading');
        } else if (e.type === 'ready') setPhase((p) => (p === 'downloading' || p === 'idle' ? 'ready' : p));
        else if (e.type === 'error') {
          // Ошибка пришла от установки (файл уже скачан) — «ещё раз» = поставить снова, не качать заново.
          setError(e.message);
          setFailedAt('install');
          setPhase('error');
        }
      }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [failedAt, setFailedAt] = useState<'download' | 'install'>('download');
  const install = async (ask = true) => {
    const r = await api?.updateInstall?.(ask);
    if (typeof r === 'object' && r) {
      if (r.ok) setPhase('installing');
      else if (r.permission) setPhase('permission');
      else {
        setError(r.error ?? 'Не получилось установить');
        setFailedAt('install');
        setPhase('error');
      }
    }
  };

  // Телефон: вернулись из настроек — если разрешение дали, ставим сами. Не дали — настройки второй раз не открываем.
  useEffect(() => {
    if (!android) return;
    const onResume = () => {
      if (phaseRef.current === 'permission') void install(false);
    };
    window.addEventListener('mnema:resume', onResume);
    return () => window.removeEventListener('mnema:resume', onResume);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setFailedAt('download');
    setError('');
    setPercent(0);
    setPhase('downloading');
    const r = await api!.updateDownload!(info.apk);
    if (!r.ok) {
      setError(r.error ?? 'Не получилось скачать');
      setPhase('error');
      return;
    }
    setPhase('ready');
    if (android) void install();
  };

  const canInstall = Boolean(api?.updateDownload) && (!android || Boolean(info.apk));
  return (
    <div className="update-box on">
      <strong>Доступна Мнема {info.latest}</strong>
      {info.notes && <p className="small muted update-notes">{info.notes}</p>}
      {!canInstall ? (
        info.apk ? (
          <a className="btn primary" href={info.apk} target="_blank" rel="noreferrer">
            Скачать APK{mb(info.size)}
          </a>
        ) : (
          <span className="small muted">В выпуске нет файла для этого устройства.</span>
        )
      ) : phase === 'downloading' ? (
        <div className="update-progress">
          <span style={{ width: percent + '%' }} />
          <b className="small">Скачиваю… {percent}%</b>
        </div>
      ) : phase === 'ready' ? (
        android ? (
          <button className="btn primary" onClick={() => void install()}>
            Установить
          </button>
        ) : (
          <button className="btn primary" onClick={() => void api?.updateInstall?.()}>
            Перезапустить и обновить
          </button>
        )
      ) : phase === 'permission' ? (
        <>
          <span className="small">
            Android спросит, можно ли Мнеме ставить обновления. Включи переключатель «Разрешить» и вернись назад — установка начнётся сама.
          </span>
          <button className="btn primary" onClick={() => void install()}>
            Установить
          </button>
        </>
      ) : phase === 'installing' ? (
        <span className="small">Подтверди в окне Android «Обновить». После установки Мнема закроется — открой её снова.</span>
      ) : (
        <>
          {phase === 'error' && <span className="small update-error">{error}</span>}
          <button className="btn primary" onClick={() => void (phase === 'error' && failedAt === 'install' ? install() : download())}>
            {phase === 'error' ? 'Попробовать ещё раз' : `Скачать и установить${android ? mb(info.size) : ''}`}
          </button>
        </>
      )}
      <span className="small muted">Твои предметы, карточки и настройки останутся — обновление ставится поверх.</span>
    </div>
  );
}

export function UpdateDialog({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  return (
    <Modal title="Новая версия" onClose={onClose} width={460}>
      <UpdateFlow info={info} />
    </Modal>
  );
}
