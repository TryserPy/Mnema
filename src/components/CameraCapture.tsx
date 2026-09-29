// Съёмка страниц камерой прямо в Мнеме (удобно на телефоне): щёлк — страница добавлена, можно снимать следующую.
import { useEffect, useRef, useState } from 'react';
import { Icon, Modal } from './ui';

export function CameraCapture({ onShot, onClose }: { onShot: (f: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3000 }, height: { ideal: 4000 } }, audio: false });
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
      } catch (e) {
        setErr('Нет доступа к камере. Разреши Мнеме камеру в настройках или выбери готовые фото. ' + ((e as Error).message ?? ''));
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(
      (b) => {
        if (!b) return;
        const n = count + 1;
        setCount(n);
        onShot(new File([b], `страница-${String(n).padStart(2, '0')}.jpg`, { type: 'image/jpeg' }));
        setFlash(true);
        setTimeout(() => setFlash(false), 180);
      },
      'image/jpeg',
      0.9
    );
  }
  return (
    <Modal title="Снять страницы" onClose={onClose} width={640} sticky>
      <div className="stack gap12">
        {err ? (
          <div className="hint warn">{err}</div>
        ) : (
          <div className={'cam-box' + (flash ? ' flash' : '')}>
            <video ref={video} playsInline muted />
            <span className="cam-frame" />
          </div>
        )}
        <p className="small muted">Держи телефон ровно над страницей, чтобы она занимала почти весь кадр. Снимай страницы по порядку.</p>
        <div className="row gap8">
          <span className="grow small">{count ? `Снято страниц: ${count}` : ''}</span>
          <button className="btn" onClick={onClose}>
            Готово
          </button>
          <button className="btn primary big shutter" disabled={Boolean(err)} onClick={shoot} aria-label="Снять">
            <Icon name="camera" size={22} /> Снять
          </button>
        </div>
      </div>
    </Modal>
  );
}
