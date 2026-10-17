import { katexHtml } from '../katexCache';
import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { parseVideo, VIDEO_ALT } from '../video';
import { videoPlayer } from './videoNode';
import { drawingBgOf, inlineDrawing } from './Drawing';
import { safeStyleAttr } from '../safeCss';
import { safeClassList } from '../katexClasses';
import { registry, runPostProcessors } from '../plugins/host';
import { calloutLook, calloutStart, matchCallout, PAGE_CHIP_AT, pageChipStart, UNSURE_AT } from '../callout';
import '../callouts.css';

export function renderTex(tex: string, display: boolean): string {
  return katexHtml(tex, { displayMode: display, output: 'htmlAndMathml', strict: false });
}

// Метка «эту разметку сделал renderTex». Классы и стили KaTeX (в том числе position:absolute у rlap/katex-inner) пропускаются только внутри метки:
// иначе <span class="katex"><span class="rlap"><span class="katex-inner" style="top:…"> в тексте рисовал бы поверх приложения поддельное окно.
// Метка у каждой отрисовки новая и случайная, в тексте её угадать нельзя; после очистки атрибут снимается.
const MARK_ATTR = 'data-mk';
let markNonce = '';
const trustedNodes = new WeakSet<Node>();

function newNonce(): string {
  const b = new Uint8Array(16);
  try {
    globalThis.crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Формула из renderTex, помеченная текущей меткой. */
function marked(html: string): string {
  return `<span ${MARK_ATTR}="${markNonce}">${html}</span>`;
}

function insideTrusted(node: Element): boolean {
  for (let n: Element | null = node; n; n = n.parentElement) if (trustedNodes.has(n)) return true;
  return false;
}

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.indexOf('$$'),
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src);
    if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() };
    return undefined;
  },
  renderer: (t) => `<div class="math-block">${marked(renderTex(t.text as string, true))}</div>`
};

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
    if (m) return { type: 'inlineMath', raw: m[0], text: m[1] };
    return undefined;
  },
  renderer: (t) => marked(renderTex(t.text as string, false))
};

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    const m = /^==([^=\n]+)==/.exec(src);
    if (m) return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
    return undefined;
  },
  renderer(t) {
    return `<mark>${this.parser.parseInline(t.tokens ?? [])}</mark>`;
  }
};

const pageRef: TokenizerAndRendererExtension = {
  name: 'pageRef',
  level: 'inline',
  start: pageChipStart,
  tokenizer(src) {
    const m = PAGE_CHIP_AT.exec(src);
    if (m) return { type: 'pageRef', raw: m[0], text: m[1] ?? m[2] };
    return undefined;
  },
  renderer: (t) => `<span class="page-ref" data-page="${Number(t.text)}">стр. ${Number(t.text)}</span>`
};

/** {?слово?} — неуверенно прочитанное слово «Тетради»: само слово с подсветкой. */
const unsure: TokenizerAndRendererExtension = {
  name: 'unsure',
  level: 'inline',
  start: (src) => {
    const i = src.indexOf('{?');
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = UNSURE_AT.exec(src);
    if (m) return { type: 'unsure', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
    return undefined;
  },
  renderer(t) {
    return `<span data-unsure="" title="Неуверенно прочитано">${this.parser.parseInline(t.tokens ?? [])}</span>`;
  }
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Выноска Obsidian «> [!def] Термин»: значок и заголовок по умолчанию — из справочника разметки; неизвестный тип — обычная рамка. */
const callout: TokenizerAndRendererExtension = {
  name: 'callout',
  level: 'block',
  start: calloutStart,
  tokenizer(src) {
    const m = matchCallout(src);
    if (!m) return undefined;
    return { type: 'callout', raw: m.raw, kind: m.kind, fold: m.fold, title: m.title, titleTokens: this.lexer.inlineTokens(m.title), tokens: this.lexer.blockTokens(m.body, []).map((x) => (x.type === 'text' && 'tokens' in x ? { ...x, type: 'paragraph' } : x)) };
  },
  childTokens: ['titleTokens', 'tokens'],
  renderer(t) {
    const look = calloutLook(t.kind as string);
    const title = t.title ? this.parser.parseInline(t.titleTokens as never) : escapeHtml(look.title);
    const head = `${look.icon ? `<span data-callout-icon="" aria-hidden="true">${look.icon}</span>` : ''}<span>${title}</span>`;
    const body = t.tokens?.length ? `<div data-callout-body="">${this.parser.parse(t.tokens)}</div>` : '';
    const attrs = `data-callout="${escapeHtml(look.kind)}"${look.known ? '' : ' data-callout-other=""'}`;
    // «-» — свёрнута, «+» — сворачивается, но открыта (как в Obsidian).
    if (t.fold) return `<details ${attrs}${t.fold === '+' ? ' open' : ''}><summary data-callout-title="">${head}</summary>${body}</details>`;
    return `<div ${attrs}><div data-callout-title="">${head}</div>${body}</div>`;
  }
};

const md = new Marked({
  gfm: true,
  breaks: true,
  extensions: [callout, blockMath, inlineMath, highlight, pageRef, unsure],
  renderer: {
    // Ссылка Refrain на тему или термин — кнопка-ссылка (переход через событие приложения)
    link({ href, tokens }) {
      if (!href.startsWith('mnema://')) return false;
      const text = this.parser.parseInline(tokens);
      return `<a class="mlink" href="#" data-mlink="${href.replace(/"/g, '')}">${text}</a>`;
    },
    // ![video](ссылка) — плеер (оживает после вставки в страницу)
    image({ href, text }) {
      if (text === VIDEO_ALT && parseVideo(href)) return `<span class="md-video" data-src="${encodeURI(href)}"></span>`;
      const dbg = drawingBgOf(href);
      if (dbg === 'theme') return `<span class="md-drawing" data-src="${href}"></span>`;
      if (dbg) return `<img src="${href}" alt="Рисунок" class="drawing-img">`;
      return false;
    }
  }
});

// Адреса, которым можно доверять в конспекте: ссылки на сайты, почта, якоря и картинки внутри данных.
// Всё остальное (//сервер/…, file:, ../../файл) убираем — иначе на Windows такая ссылка или картинка
// ведёт в чужую папку или открывает чужую страницу прямо в окне Refrain.
const SAFE_URL = /^(#|https?:|mailto:|data:image\/|blob:)/i;
// %2e%2e браузер понимает как «..» — его тоже не пропускаем.
const LOCAL_REL = /^(?![\\/])(?!.*\.\.)(?!.*%2e)[\w\-./%]+$/i;
let markdownPass = false;
// В тестах без браузера DOMPurify — заглушка без хуков.
if (DOMPurify.isSupported) DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  for (const a of ['href', 'xlink:href', 'src', 'poster', 'background', 'action', 'formaction']) {
    const v = node.getAttribute(a);
    if (v != null && !SAFE_URL.test(v.trim()) && !LOCAL_REL.test(v.trim())) node.removeAttribute(a);
  }
  node.removeAttribute('srcset');
  // Ссылка в новой вкладке (веб-версия) не должна получить доступ к окну Refrain через window.opener.
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    if (node.hasAttribute('target')) node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  // Метка формулы: принимаем только свою (текущую) и сразу снимаем атрибут; чужие значения вычищаем.
  let trusted = false;
  if (markdownPass && node.hasAttribute(MARK_ATTR)) {
    if (markNonce && node.getAttribute(MARK_ATTR) === markNonce) trustedNodes.add(node);
    node.removeAttribute(MARK_ATTR);
  }
  if (markdownPass) trusted = insideTrusted(node);
  // Свой class и id в тексте не нужны: класс .modal-back и подобные рисовали бы поверх приложения поддельное окно.
  if (markdownPass) {
    if (node.hasAttribute('class')) {
      const cl = safeClassList(node.getAttribute('class') ?? '', trusted);
      if (cl) node.setAttribute('class', cl);
      else node.removeAttribute('class');
    }
    node.removeAttribute('id');
  }
  // Свои стили в конспекте не нужны (поддельные кнопки поверх окна, скрытие частей окна), кроме формул KaTeX, сделанных renderTex.
  if (markdownPass && node.hasAttribute('style')) {
    // Внутри формулы оставляем только безопасное (размеры, сдвиги, цвет); position/z-index/inset/url не пропускаем никогда.
    const st = trusted ? safeStyleAttr(node.getAttribute('style') ?? '') : '';
    if (st) node.setAttribute('style', st);
    else node.removeAttribute('style');
  }
});

export function renderMarkdown(src: string): string {
  markNonce = newNonce();
  const html = (md.parse(src, { async: false }) as string)
    // Флажки списка задач — значками: поля ввода в конспекте запрещены.
    .replace(/<input (checked="" )?disabled="" type="checkbox">/g, (_m, on) => `<span class="md-check">${on ? '☑' : '☐'}</span>`);
  markdownPass = true;
  try {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['aria-hidden', 'data-page', 'data-src', 'data-mlink', 'data-callout', 'data-callout-other', 'data-callout-title', 'data-callout-icon', 'data-callout-body', 'data-unsure'],
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'track', 'object', 'embed', 'link', 'meta', 'base', 'iframe', 'frame', 'dialog']
    });
  } finally {
    markdownPass = false;
    markNonce = '';
  }
}

export function Markdown({ text, className, onPage }: { text: string; className?: string; onPage?: (n: number) => void }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of ref.current?.querySelectorAll<HTMLElement>('.md-video') ?? []) {
      const info = parseVideo(decodeURI(el.dataset.src ?? ''));
      if (info && !el.firstChild) el.appendChild(videoPlayer(info));
    }
    for (const el of ref.current?.querySelectorAll<HTMLElement>('.md-drawing') ?? []) {
      const n = !el.firstChild && inlineDrawing(el.dataset.src ?? '');
      if (n) el.appendChild(n);
    }
    if (ref.current && registry.postProcessors.length) runPostProcessors(ref.current, text);
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={ref}
      className={'md ' + (className ?? '') + (onPage ? ' pages-clickable' : '')}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const ml = (e.target as HTMLElement).closest?.('a[data-mlink]') as HTMLElement | null;
        if (ml) {
          e.preventDefault();
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('mnema:open-link', { detail: ml.dataset.mlink }));
          return;
        }
        const el = (e.target as HTMLElement).closest?.('.page-ref') as HTMLElement | null;
        if (el && onPage) onPage(Number(el.dataset.page));
      }}
    />
  );
}
