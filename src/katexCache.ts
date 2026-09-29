// Формулы рисуются через KaTeX. Одна и та же формула встречается много раз (конспект, карточки),
// поэтому запоминаем готовую разметку — открытие темы с формулами становится заметно быстрее.
import katex from 'katex';

const cache = new Map<string, string>();
const MAX = 3000;

export function katexHtml(tex: string, opts: katex.KatexOptions = {}): string {
  const key = (opts.displayMode ? 'D' : 'I') + (opts.output ?? '') + '|' + tex;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(tex, { throwOnError: false, ...opts });
    if (cache.size > MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}

const k = katex as unknown as { render: (tex: string, el: HTMLElement, opts?: katex.KatexOptions) => void; __mnemaCached?: boolean };
if (!k.__mnemaCached) {
  k.render = (tex, el, opts) => {
    el.innerHTML = katexHtml(tex, opts);
  };
  k.__mnemaCached = true;
}
