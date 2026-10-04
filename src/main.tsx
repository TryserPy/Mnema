import './platform/android';
import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import '@fontsource/literata/cyrillic-500.css';
import '@fontsource/literata/cyrillic-600.css';
import '@fontsource/literata/latin-500.css';
import '@fontsource/literata/latin-600.css';
import 'katex/dist/katex.min.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './design.css';
import './motion2.css';

async function start() {
  // В браузере мост window.mnemaApi собирает platform/web.ts — до того, как store.ts прочитает данные.
  // Поэтому приложение подключаем только теперь, а не в начале файла. На Windows и Android этот шаг пропускается.
  if (!window.mnemaApi && !(window as unknown as { MnemaAndroid?: unknown }).MnemaAndroid) {
    const { initWeb } = await import('./platform/web');
    if (!(await initWeb())) return;
  }
  const [{ App }, { ErrorBoundary }, { touchUI }] = await Promise.all([import('./App'), import('./components/ErrorBoundary'), import('./components/ui')]);

  // Телефон или планшет: прячем подсказки про клавиши и мышь (html[data-touch] в CSS).
  if (touchUI()) document.documentElement.dataset.touch = '1';

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* Самый верхний предохранитель: если упадёт сама оболочка (не экран), будет понятное сообщение, а не белое окно. */}
      <ErrorBoundary onHome={() => location.reload()}>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

void start();
