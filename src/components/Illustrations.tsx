// Маленькие рисунки для справки и знакомства: лёгкий SVG, оживает CSS-анимацией (настройка «Анимации → Картинки в справке»).
// Цвета берут из темы, поэтому подходят к любому оформлению. Видеофайлов нет — приложение остаётся лёгким и работает без сети.
import type { ReactNode } from 'react';

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg className="illu" viewBox="0 0 240 140" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Предмет → тема. */
export function IlluTree() {
  return (
    <Frame label="Предмет, а в нём темы">
      <rect className="i-surface" x="20" y="16" width="200" height="108" rx="14" />
      <rect className="i-accent" x="34" y="30" width="26" height="22" rx="6" />
      <rect className="i-ink" x="68" y="36" width="80" height="10" rx="5" />
      {[0, 1, 2].map((i) => (
        <g key={i} className="i-slide" style={{ animationDelay: i * 0.35 + 's' }}>
          <rect className="i-sunken" x="52" y={62 + i * 19} width="154" height="14" rx="7" />
          <circle className="i-accent" cx="63" cy={69 + i * 19} r="4" />
          <rect className="i-line" x="74" y={66 + i * 19} width={90 - i * 14} height="6" rx="3" />
        </g>
      ))}
    </Frame>
  );
}

/** Конспект своими словами. */
export function IlluNote() {
  return (
    <Frame label="Конспект: строки появляются, главное выделено">
      <rect className="i-surface" x="30" y="12" width="180" height="116" rx="12" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} className={'i-write ' + (i === 1 ? 'i-ink' : 'i-line')} style={{ animationDelay: i * 0.3 + 's', transformOrigin: '48px 0' }} x="48" y={30 + i * 20} width={i === 1 ? 110 : 144 - (i % 3) * 18} height="8" rx="4" />
      ))}
      <rect className="i-mark" x="48" y="46" width="110" height="14" rx="4" />
    </Frame>
  );
}

/** Выделил главное — получилась карточка. */
export function IlluMake() {
  return (
    <Frame label="Выделил главное — получилась карточка">
      <rect className="i-surface" x="14" y="22" width="108" height="96" rx="12" />
      <rect className="i-line" x="26" y="38" width="84" height="7" rx="3.5" />
      <rect className="i-mark" x="26" y="54" width="70" height="14" rx="4" />
      <rect className="i-line" x="26" y="78" width="76" height="7" rx="3.5" />
      <rect className="i-line" x="26" y="94" width="50" height="7" rx="3.5" />
      <path className="i-arrow" d="M128 70h24m-8-8 8 8-8 8" />
      <g className="i-pop">
        <rect className="i-accent-soft" x="158" y="40" width="70" height="60" rx="10" />
        <rect className="i-ink" x="170" y="54" width="46" height="7" rx="3.5" />
        <rect className="i-line" x="170" y="72" width="34" height="7" rx="3.5" />
      </g>
    </Frame>
  );
}

/** Вспоминай: вопрос — пауза — ответ. */
export function IlluRecall() {
  return (
    <Frame label="Карточка: сначала вспомни, потом переверни">
      <g className="i-flip">
        <rect className="i-surface" x="60" y="22" width="120" height="96" rx="14" />
        <text className="i-q" x="120" y="86" textAnchor="middle">?</text>
      </g>
      <g className="i-flip i-flip-back">
        <rect className="i-accent-soft" x="60" y="22" width="120" height="96" rx="14" />
        <path className="i-check" d="M96 72l16 16 32-34" />
      </g>
    </Frame>
  );
}

/** Повторяй с перерывами: промежутки растут. */
export function IlluSpaced() {
  const xs = [26, 52, 94, 156, 214];
  return (
    <Frame label="Повторения: между ними всё больше времени">
      <path className="i-curve" d="M20 30 C 60 30, 70 110, 110 110 S 170 60, 220 60" />
      <line className="i-axis" x1="16" y1="120" x2="228" y2="120" />
      {xs.map((x, i) => (
        <g key={x} className="i-dot" style={{ animationDelay: i * 0.45 + 's' }}>
          <circle className="i-accent" cx={x} cy={120} r="7" />
          <path className="i-tick" d={`M${x - 3} 120l2.4 2.6 4-5`} />
        </g>
      ))}
    </Frame>
  );
}

/** Смешивай похожее: блоки меняются местами. */
export function IlluMix() {
  const cells = [0, 1, 2, 3, 4, 5];
  return (
    <Frame label="Темы перемешиваются">
      {cells.map((i) => (
        <rect key={i} className={'i-mix i-mix' + i + (i % 2 ? ' i-accent' : ' i-accent-soft')} x={36 + (i % 3) * 62} y={30 + Math.floor(i / 3) * 46} width="50" height="36" rx="9" />
      ))}
    </Frame>
  );
}

/** «Учиться»: кольцо дня заполняется. */
export function IlluStart() {
  return (
    <Frame label="Одна кнопка «Учиться»: кольцо заполняется">
      <circle className="i-ring-bg" cx="120" cy="70" r="42" />
      <circle className="i-ring" cx="120" cy="70" r="42" />
      <path className="i-play" d="M110 54l26 16-26 16z" />
    </Frame>
  );
}
