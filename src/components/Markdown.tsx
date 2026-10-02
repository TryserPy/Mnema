import { katexHtml } from '../katexCache';
import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { parseVideo, VIDEO_ALT } from '../video';
import { videoPlayer } from './videoNode';
import { drawingBgOf, inlineDrawing } from './Drawing';
import { safeStyleAttr } from '../safeCss';
import { registry, runPostProcessors } from '../plugins/host';

export function renderTex(tex: string, display: boolean): string {
  return katexHtml(tex, { displayMode: display, output: 'htmlAndMathml', strict: false });
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
  renderer: (t) => `<div class="math-block">${renderTex(t.text as string, true)}</div>`
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
  renderer: (t) => renderTex(t.text as string, false)
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
  start: (src) => {
    const i = src.search(/\\?\[стр\./);
    return i < 0 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^\\?\[стр\.\s*(\d{1,4})\\?\]/.exec(src);
    if (m) return { type: 'pageRef', raw: m[0], text: m[1] };
    return undefined;
  },
  renderer: (t) => `<span class="page-ref" data-page="${Number(t.text)}">стр. ${Number(t.text)}</span>`
};

const md = new Marked({
  gfm: true,
  breaks: true,
  extensions: [blockMath, inlineMath, highlight, pageRef],
  renderer: {
    // Ссылка Мнемы на тему или термин — кнопка-ссылка (переход через событие приложения)
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
// ведёт в чужую папку или открывает чужую страницу прямо в окне Мнемы.
const SAFE_URL = /^(#|https?:|mailto:|data:image\/|blob:)/i;
const LOCAL_REL = /^(?![\\/])(?!.*\.\.)[\w\-./%]+$/;
let markdownPass = false;
// В тестах без браузера DOMPurify — заглушка без хуков.
if (DOMPurify.isSupported) DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  for (const a of ['href', 'xlink:href', 'src', 'poster', 'background', 'action', 'formaction']) {
    const v = node.getAttribute(a);
    if (v != null && !SAFE_URL.test(v.trim()) && !LOCAL_REL.test(v.trim())) node.removeAttribute(a);
  }
  node.removeAttribute('srcset');
  // Свои стили в конспекте не нужны (поддельные кнопки поверх окна, скрытие частей окна), кроме формул KaTeX.
  if (markdownPass && node.hasAttribute('style')) {
    // Внутри формулы оставляем только безопасное (размеры, сдвиги, цвет); класс math-block можно написать руками, поэтому position/z-index/inset/url не пропускаем никогда.
    const st = node.closest('.katex, .math-block') ? safeStyleAttr(node.getAttribute('style') ?? '') : '';
    if (st) node.setAttribute('style', st);
    else node.removeAttribute('style');
  }
});

export function renderMarkdown(src: string): string {
  const html = (md.parse(src, { async: false }) as string)
    // Флажки списка задач — значками: поля ввода в конспекте запрещены.
    .replace(/<input (checked="" )?disabled="" type="checkbox">/g, (_m, on) => `<span class="md-check">${on ? '☑' : '☐'}</span>`);
  markdownPass = true;
  try {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ['aria-hidden', 'data-page', 'data-src', 'data-mlink'],
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'track', 'object', 'embed', 'link', 'meta', 'base', 'iframe', 'frame', 'dialog']
    });
  } finally {
    markdownPass = false;
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
