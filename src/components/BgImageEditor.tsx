// Свой фон картинкой: выбрать файл, поставить как нужно (место, размер, видимость, размытие, затемнение, неподвижно или прокручивается),
// решить, видна ли картинка под боковой панелью и шапкой на телефоне. Используется и в «Оформлении», и во вкладке «Фон» редактора стиля.
// Сами правила рисования — bgimage.css, числа — bgImage.ts.
import { useRef, useState } from 'react';
import { BG_PLACES, BG_SIZES, BG_SRC, MAX_BG_SRC, newBg } from '../bgImage';
import type { BgImage } from '../types';
import { Icon, Segmented, Switch, toast } from './ui';

/** Сжать выбранную картинку: не больше 1920 px по длинной стороне, JPEG. Слишком тяжёлую пережимаем сильнее. */
export async function readBgFile(f: File): Promise<string> {
  // Старый WebView не знает imageOrientation — тогда без него.
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(f));
  let side = 1920;
  let quality = 0.8;
  for (let i = 0; i < 4; i++) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d')!;
    // Прозрачные места PNG в JPEG стали бы чёрными — подкладываем белый.
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', quality);
    if (url.length < MAX_BG_SRC * 0.9 || i === 3) {
      bmp.close();
      return url;
    }
    side = Math.round(side * 0.75);
    quality = Math.max(0.55, quality - 0.1);
  }
  bmp.close();
  throw new Error('big');
}

const pct = (n: number) => Math.round(n * 100);

function Slider({ label, hint, value, min, max, step = 1, unit, onChange, disabled }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="se-row">
      <div className="se-row-text">
        <span className="se-row-label">{label}</span>
        {hint && <span className="small muted">{hint}</span>}
      </div>
      <span className="row gap8 se-slider">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="small se-val">
          {value}
          {unit}
        </span>
      </span>
    </div>
  );
}

/** `bg` — настройки фона (в стиле они бывают без картинки: тогда они подстроятся под ту, что уже стоит). */
export function BgImageEditor({ bg, onChange, inStyle = false }: { bg: Partial<BgImage> | undefined; onChange: (bg: Partial<BgImage> | undefined) => void; inStyle?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const cur: BgImage | null = bg ? { ...newBg(''), ...bg } : null;
  const src = cur?.src && BG_SRC.test(cur.src) ? cur.src : '';
  const patch = (p: Partial<BgImage>) => onChange({ ...(bg ?? {}), ...p });

  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const url = await readBgFile(f);
      // Новая картинка: если настройки уже были — оставляем их, иначе берём удобные для начала.
      onChange(bg ? { ...bg, src: url } : newBg(url));
    } catch {
      toast('Не получилось открыть картинку — попробуй другой файл (JPG или PNG)');
    } finally {
      setBusy(false);
    }
  }

  function aim(e: React.PointerEvent) {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    patch({ x: Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))) });
  }

  const input = <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ''))} />;
  if (!cur) {
    return (
      <div className="stack gap8" data-set="bgimage">
        <div className="row gap8 wrap">
          <button type="button" className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Выбрать картинку
          </button>
        </div>
        <span className="small muted">Картинка встанет под всё окно — и под боковую панель тоже. Потом можно сдвинуть, увеличить, размыть и сделать бледнее.</span>
        {input}
      </div>
    );
  }
  const scroll = cur.fixed === false;
  const dimOverlay = cur.dim > 0 ? `color-mix(in srgb, ${cur.tint} ${pct(cur.dim)}%, transparent)` : 'transparent';
  return (
    <div className="stack gap8" data-set="bgimage">
      <div className="row between gap8 wrap">
        <span className="small muted">{src ? 'Картинка выбрана' : 'В стиле есть только настройки фона — картинка будет ваша'}</span>
        <div className="row gap8 wrap">
          <button type="button" className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> {src ? 'Другая' : 'Выбрать файл'}
          </button>
          <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>
            {inStyle ? 'Убрать из стиля' : 'Убрать'}
          </button>
        </div>
      </div>
      {input}
      {src && (
        <div className="stack gap4">
          <span className="small muted">Нажми или перетащи точку — это главное место картинки (оно останется на виду при любом размере окна).</span>
          <div
            ref={boxRef}
            className="bg-pick"
            role="slider"
            aria-label="Главное место картинки"
            aria-valuetext={`по горизонтали ${cur.x}%, по вертикали ${cur.y}%`}
            tabIndex={0}
            onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), aim(e))}
            onPointerMove={(e) => e.buttons && aim(e)}
            onKeyDown={(e) => {
              const d = e.shiftKey ? 10 : 2;
              const move: Record<string, Partial<BgImage>> = { ArrowLeft: { x: Math.max(0, cur.x - d) }, ArrowRight: { x: Math.min(100, cur.x + d) }, ArrowUp: { y: Math.max(0, cur.y - d) }, ArrowDown: { y: Math.min(100, cur.y + d) } };
              if (move[e.key]) (e.preventDefault(), patch(move[e.key]));
            }}
          >
            <span
              className="bg-layer"
              style={{
                backgroundImage: `url("${src}")`,
                backgroundPosition: `${cur.x}% ${cur.y}%`,
                backgroundSize: cur.size === 'cover' ? 'cover' : cur.size === 'contain' ? 'contain' : `${cur.zoom}% auto`,
                backgroundRepeat: cur.size === 'tile' ? 'repeat' : 'no-repeat',
                filter: `blur(${Math.min(cur.blur, 8) / 3}px)`
              }}
            />
            <span className="bg-layer" style={{ background: dimOverlay }} />
            <span className="bg-layer" style={{ background: `color-mix(in srgb, var(--bg) ${pct(1 - cur.opacity)}%, transparent)` }} />
            <span className="bg-dot" style={{ left: `${cur.x}%`, top: `${cur.y}%` }} />
          </div>
          <div className="se-chips wrap" role="group" aria-label="Расположение">
            {BG_PLACES.map((p) => (
              <button key={p.name} type="button" className={'se-chip' + (cur.x === p.x && cur.y === p.y ? ' on' : '')} onClick={() => patch({ x: p.x, y: p.y })}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Размер</span>
          <span className="small muted">{BG_SIZES.find((s) => s.id === cur.size)?.hint}</span>
        </div>
        <div className="se-chips" role="radiogroup" aria-label="Размер картинки">
          {BG_SIZES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={cur.size === s.id} className={'se-chip' + (cur.size === s.id ? ' on' : '')} onClick={() => patch({ size: s.id })}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {(cur.size === 'zoom' || cur.size === 'tile') && <Slider label={cur.size === 'tile' ? 'Размер плитки' : 'Масштаб'} value={cur.zoom} min={10} max={400} step={5} unit="%" onChange={(zoom) => patch({ zoom })} />}
      <Slider label="Насколько видно картинку" hint="0 % — не видно, 100 % — как есть, без цвета темы сверху." value={pct(cur.opacity)} min={0} max={100} unit=" %" onChange={(v) => patch({ opacity: v / 100 })} />
      {cur.opacity > 0.5 && cur.dim < 0.2 && <span className="se-warn small">Картинка яркая — текст прямо на ней может плохо читаться. Убавь видимость или добавь затемнение.</span>}
      <Slider label="Размытие" hint={scroll ? 'У прокручиваемой картинки размытия нет.' : undefined} value={cur.blur} min={0} max={40} unit=" px" disabled={scroll} onChange={(blur) => patch({ blur })} />
      <Slider label="Цвет поверх картинки" hint="Затемнение (или осветление) — чтобы текст читался." value={pct(cur.dim)} min={0} max={85} unit=" %" onChange={(v) => patch({ dim: v / 100 })} />
      {cur.dim > 0 && (
        <div className="se-row">
          <span className="se-row-label">Какого цвета</span>
          <div className="se-chips" role="radiogroup" aria-label="Цвет поверх картинки">
            {[
              ['#000000', 'Чёрный'],
              ['#FFFFFF', 'Белый']
            ].map(([c, n]) => (
              <button key={c} type="button" role="radio" aria-checked={cur.tint.toUpperCase() === c} className={'se-chip' + (cur.tint.toUpperCase() === c ? ' on' : '')} onClick={() => patch({ tint: c })}>
                {n}
              </button>
            ))}
            <label className={'se-chip' + (!['#000000', '#ffffff'].includes(cur.tint.toLowerCase()) ? ' on' : '')}>
              Свой&nbsp;
              <input type="color" className="se-color-mini" aria-label="Свой цвет поверх картинки" value={cur.tint} onChange={(e) => patch({ tint: e.target.value })} />
            </label>
          </div>
        </div>
      )}
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Картинка при прокрутке</span>
          <span className="small muted">Стоит на месте, пока листаешь, или едет вместе с текстом.</span>
        </div>
        <Segmented
          ariaLabel="Картинка при прокрутке"
          value={scroll ? 'scroll' : 'fixed'}
          onChange={(v) => patch({ fixed: v === 'fixed' })}
          options={[
            { value: 'fixed', label: 'Стоит на месте' },
            { value: 'scroll', label: 'Прокручивается' }
          ]}
        />
      </div>
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Под боковой панелью тоже</span>
          <span className="small muted">{scroll ? 'Прокручиваемая картинка лежит только за экраном, под панелью её нет.' : 'Панель становится полупрозрачной: сквозь неё видна картинка, а текст остаётся чётким.'}</span>
        </div>
        <Switch label="Картинка под боковой панелью" checked={cur.underSide && !scroll} onChange={(v) => patch({ underSide: v })} />
      </div>
      {cur.underSide && !scroll && <Slider label="Прозрачность панели" hint="0 % — панель как обычно, 70 % — почти стекло." value={pct(1 - cur.sideAlpha)} min={0} max={70} unit=" %" onChange={(v) => patch({ sideAlpha: Math.round((1 - v / 100) * 100) / 100 })} />}
      <div className="se-row">
        <div className="se-row-text">
          <span className="se-row-label">Под шапкой на телефоне</span>
          <span className="small muted">Верхняя полоса на телефоне тоже пропускает картинку. (Выдвижная панель остаётся плотной — она лежит поверх текста.)</span>
        </div>
        <Switch label="Картинка под шапкой на телефоне" checked={cur.underBar && !scroll} onChange={(v) => patch({ underBar: v })} />
      </div>
      {cur.underBar && !scroll && <Slider label="Прозрачность шапки" value={pct(1 - cur.barAlpha)} min={0} max={70} unit=" %" onChange={(v) => patch({ barAlpha: Math.round((1 - v / 100) * 100) / 100 })} />}
    </div>
  );
}
