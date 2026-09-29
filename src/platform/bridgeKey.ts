// Ключ моста MnemaAndroid. Android подставляет мост во все фреймы (и во встроенные плееры видео),
// поэтому Java выполняет вызов, только если передан ключ. Ключ приходит в <meta name="mnema-k"> нашей
// страницы: читаем его один раз и убираем из разметки.
let key: string | null = null;

export function bridgeKey(): string {
  if (key === null) {
    const m = typeof document !== 'undefined' ? document.querySelector('meta[name="mnema-k"]') : null;
    key = m?.getAttribute('content') ?? '';
    m?.remove();
  }
  return key;
}
