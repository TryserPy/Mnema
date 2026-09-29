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
import { App } from './App';
import { touchUI } from './components/ui';
import './styles.css';
import './design.css';

// Телефон или планшет: прячем подсказки про клавиши и мышь (html[data-touch] в CSS).
if (touchUI()) document.documentElement.dataset.touch = '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
