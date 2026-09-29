import { katexHtml } from '../katexCache';
import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { parseVideo, VIDEO_ALT } from '../video';
import { videoPlayer } from './videoNode';
import { drawingBgOf, inlineDrawing } from './Drawing';
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

export function renderMarkdown(src: string): string {
  const html = md.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['aria-hidden', 'data-page', 'data-src', 'data-mlink'] });
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
