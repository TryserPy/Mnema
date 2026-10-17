// «Закрыть часть картинки» (1.32, N5) — карточка, как Image Occlusion в Anki: на картинке рамки, каждая рамка (или группа
// рамок) — отдельный вопрос «что здесь?». Картинка лежит в front как Markdown-картинка data: (её покажут и старые версии
// Refrain, и экспорт в Markdown), рамки — в card.occl долями ширины и высоты (0…1), поэтому не зависят от размера картинки.
// Здесь только чистые функции: проверка данных, вопросы, обмен с Anki.

export interface OcclMask {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Что под рамкой — показывается в ответе (по желанию). */
  label?: string;
  /** Группа: рамки с одной группой спрашиваются вместе (как c1 у Anki). Нет — у рамки своя группа. */
  g?: number;
}

export interface Occlusion {
  masks: OcclMask[];
  /** true — пока спрашиваем одну рамку, остальные тоже закрыты («спрятать все»); false — видны. */
  all: boolean;
}

export const OCCL_MAX_MASKS = 80;
export const OCCL_LABEL_MAX = 200;
const ALT = 'Картинка с закрытыми частями';

const num01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : NaN);

/** Рамки из данных (чужая копия, файл .mnema): только числа в 0…1, не больше OCCL_MAX_MASKS, подписи — короткие. */
export function cleanOcclusion(raw: unknown): Occlusion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { masks?: unknown; all?: unknown };
  if (!Array.isArray(r.masks)) return undefined;
  const masks: OcclMask[] = [];
  for (const m of r.masks.slice(0, OCCL_MAX_MASKS)) {
    if (!m || typeof m !== 'object') continue;
    const o = m as Record<string, unknown>;
    const x = num01(o.x);
    const y = num01(o.y);
    const w = Math.min(num01(o.w), 1 - x);
    const h = Math.min(num01(o.h), 1 - y);
    if ([x, y, w, h].some(Number.isNaN) || w < 0.002 || h < 0.002) continue;
    const label = typeof o.label === 'string' ? o.label.replace(/\s+/g, ' ').trim().slice(0, OCCL_LABEL_MAX) : '';
    const g = Number.isInteger(o.g) && (o.g as number) >= 0 && (o.g as number) < 1000 ? (o.g as number) : undefined;
    masks.push({ x, y, w, h, ...(label ? { label } : {}), ...(g !== undefined ? { g } : {}) });
  }
  return masks.length ? { masks, all: r.all !== false } : undefined;
}

/** Группы по порядку первой рамки: номер элемента повторения (ord) → номер группы. */
export function occlGroups(o: Occlusion): number[] {
  const out: number[] = [];
  o.masks.forEach((m, i) => {
    const g = m.g ?? 1000 + i;
    if (!out.includes(g)) out.push(g);
  });
  return out;
}

/** Рамки, которые спрашиваются в элементе ord. */
export function occlTarget(o: Occlusion, ord: number): Set<number> {
  const g = occlGroups(o)[ord];
  const set = new Set<number>();
  o.masks.forEach((m, i) => (m.g ?? 1000 + i) === g && set.add(i));
  return set;
}

/** Ответ элемента: подписи его рамок через запятую. */
export function occlAnswer(o: Occlusion, ord: number): string {
  return [...occlTarget(o, ord)]
    .map((i) => o.masks[i].label)
    .filter(Boolean)
    .join(', ');
}

/** Картинка из front (Markdown-картинка data:image). */
export function occlImage(front: string): string | null {
  return /!\[[^\]]*\]\((data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)\)/.exec(front)?.[1] ?? null;
}

export const occlFront = (img: string) => `![${ALT}](${img})`;

// ---------- Anki Image Occlusion (23.10+) ----------

const frac = (v: number) => {
  const s = (Math.round(v * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return s.startsWith('0.') ? s.slice(1) : s;
};

/** Поле Occlusion заметки Anki: {{cN::image-occlusion:rect:left=…:top=…:width=…:height=…:oi=1}} (oi=1 — «спрятать все»). */
export function toAnkiOcclusion(o: Occlusion): string {
  const groups = occlGroups(o);
  return o.masks
    .map((m, i) => {
      const c = groups.indexOf(m.g ?? 1000 + i) + 1;
      return `{{c${c}::image-occlusion:rect:left=${frac(m.x)}:top=${frac(m.y)}:width=${frac(m.w)}:height=${frac(m.h)}${o.all ? ':oi=1' : ''}}}`;
    })
    .join('<br>');
}

/** Поле Occlusion из Anki → рамки. Эллипсы и многоугольники — описанным прямоугольником. null — рамок нет. */
export function fromAnkiOcclusion(field: string): Occlusion | null {
  const masks: OcclMask[] = [];
  let anyOi = false;
  for (const m of field.matchAll(/\{\{c(\d+)::image-occlusion:(rect|ellipse|polygon|text)((?::[\w-]+=[^:}]*)*)\}\}/gi)) {
    const props: Record<string, string> = {};
    for (const p of m[3].split(':').filter(Boolean)) {
      const eq = p.indexOf('=');
      if (eq > 0) props[p.slice(0, eq)] = p.slice(eq + 1);
    }
    if (props.oi === '1') anyOi = true;
    let x: number;
    let y: number;
    let w: number;
    let h: number;
    if (m[2] === 'polygon') {
      const pts = (props.points ?? '').trim().split(/\s+/).map((s) => s.split(',').map(Number));
      const xs = pts.map((p) => p[0]).filter(Number.isFinite);
      const ys = pts.map((p) => p[1]).filter(Number.isFinite);
      if (!xs.length || !ys.length) continue;
      x = Math.min(...xs);
      y = Math.min(...ys);
      w = Math.max(...xs) - x;
      h = Math.max(...ys) - y;
    } else if (m[2] === 'ellipse') {
      const rx = Number(props.rx);
      const ry = Number(props.ry);
      x = Number(props.left);
      y = Number(props.top);
      w = rx * 2;
      h = ry * 2;
    } else {
      x = Number(props.left);
      y = Number(props.top);
      w = Number(props.width);
      h = Number(props.height);
    }
    // Старые заметки хранили пиксели — такие пропускаем (без размеров картинки их не пересчитать).
    if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1.0001)) continue;
    masks.push({ x, y, w, h, g: Number(m[1]) - 1 });
  }
  const o = cleanOcclusion({ masks, all: anyOi || !masks.length });
  return o ?? null;
}

/** Шаблоны заметки «Image Occlusion» Anki 23.10+ — по ним Anki сам рисует рамки (anki.imageOcclusion.setup). */
const IO_SIDE = `{{#Header}}<div>{{Header}}</div>{{/Header}}
<div style="display: none">{{cloze:Occlusion}}</div>
<div id="err"></div>
<div id="image-occlusion-container">
    {{Image}}
    <canvas id="image-occlusion-canvas"></canvas>
</div>
<script>
try {
    anki.imageOcclusion.setup();
} catch (exc) {
    document.getElementById("err").innerHTML = \`Error loading image occlusion. Is your Anki version up to date?<br><br>\${exc}\`;
}
</script>`;
export const ANKI_IO_FRONT = IO_SIDE;
export const ANKI_IO_BACK = `${IO_SIDE}
<div><button id="toggle">Toggle Masks</button></div>
{{#Back Extra}}<div>{{Back Extra}}</div>{{/Back Extra}}`;
export const ANKI_IO_CSS = `#image-occlusion-canvas {
    --inactive-shape-color: #ffeba2;
    --active-shape-color: #ff8e8e;
    --inactive-shape-border: 1px #212121;
    --active-shape-border: 1px #212121;
    --highlight-shape-color: #ff8e8e00;
    --highlight-shape-border: 1px #ff8e8e;
}
.card {
    font-family: arial;
    font-size: 20px;
    text-align: center;
    color: black;
    background-color: white;
}`;
