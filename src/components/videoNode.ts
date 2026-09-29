// Картинка в конспекте, которая умеет быть видео: ![video](ссылка) показывается как плеер.
// В Markdown остаётся обычная ссылка-картинка — её понимает и Obsidian.
import Image from '@tiptap/extension-image';
import { parseVideo, VIDEO_ALT, type VideoInfo } from '../video';
import { drawingBgOf, inlineDrawing } from './Drawing';

export function videoPlayer(info: VideoInfo, opts: { onDelete?: () => void } = {}): HTMLElement {
  const box = document.createElement('span');
  box.className = 'video-embed ve-' + info.kind;
  box.contentEditable = 'false';
  const stage = document.createElement('span');
  stage.className = 've-stage';
  const play = () => {
    stage.innerHTML = '';
    if (info.kind === 'file') {
      const v = document.createElement('video');
      v.src = info.embed;
      v.controls = true;
      v.autoplay = true;
      stage.appendChild(v);
    } else {
      const f = document.createElement('iframe');
      f.src = info.embed;
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      f.title = info.label;
      stage.appendChild(f);
    }
    box.classList.add('playing');
  };
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 've-cover';
  cover.setAttribute('aria-label', 'Смотреть видео');
  if (info.thumb) cover.style.backgroundImage = `url("${info.thumb}")`;
  cover.innerHTML = `<span class="ve-play" aria-hidden="true">▶</span><span class="ve-label">${info.label}</span>`;
  cover.addEventListener('mousedown', (e) => e.preventDefault());
  cover.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    play();
  });
  stage.appendChild(cover);
  box.appendChild(stage);
  const bar = document.createElement('span');
  bar.className = 've-bar';
  const a = document.createElement('a');
  a.href = info.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Открыть в браузере ↗';
  bar.appendChild(a);
  if (opts.onDelete) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 've-del';
    del.textContent = 'Убрать видео';
    del.addEventListener('mousedown', (e) => e.preventDefault());
    del.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onDelete!();
    });
    bar.appendChild(del);
  }
  box.appendChild(bar);
  return box;
}

export const VideoImage = Image.extend({
  // Видео не рисуем как <img>: иначе при первом показе браузер пытается загрузить страницу YouTube как картинку.
  parseHTML() {
    return [
      { tag: 'span.md-video[data-src]', getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute('data-src'), alt: VIDEO_ALT }) },
      ...(this.parent?.() ?? [])
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    if (node.attrs.alt === VIDEO_ALT && parseVideo(node.attrs.src ?? '')) return ['span', { class: 'md-video', 'data-src': node.attrs.src }];
    return this.parent!({ node, HTMLAttributes });
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const info = node.attrs.alt === VIDEO_ALT ? parseVideo(node.attrs.src) : null;
      if (!info) {
        const dbg = drawingBgOf(node.attrs.src ?? '');
        if (dbg === 'theme') {
          const el = inlineDrawing(node.attrs.src);
          if (el) return { dom: el };
        }
        const img = document.createElement('img');
        img.src = node.attrs.src;
        if (dbg) img.className = 'drawing-img';
        if (node.attrs.alt) img.alt = node.attrs.alt;
        if (node.attrs.title) img.title = node.attrs.title;
        return { dom: img };
      }
      const dom = videoPlayer(info, {
        onDelete: () => {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
        }
      });
      return {
        dom,
        stopEvent: (e: Event) => (e.target as HTMLElement).closest?.('.ve-stage, .ve-bar') !== null,
        ignoreMutation: () => true
      };
    };
  }
});
