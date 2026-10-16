// Редактор конспекта (NoteEditor.tsx): выноска «> [!def] Термин» узлом TipTap, плашка [стр. N] и подсветка {?слово?}.
// В Markdown всё записывается как в Obsidian и читается обратно без потерь (src/v131-callouts.test.ts).
import { Extension, findParentNode, InputRule, mergeAttributes, Node, nodeInputRule, type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CALLOUTS, MARKS } from '../shared/prompts/markup';
import { calloutHeadLine, calloutLook, calloutStart, matchCallout, PAGE_CHIP_AT, pageChipStart, type CalloutFold } from './callout';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Выделенное — в выноску этого типа; курсор уже в выноске — поменять тип; в рамке — рамка становится выноской. */
      setCallout: (kind: string) => ReturnType;
      /** Убрать выноску вокруг курсора: текст остаётся (заголовок — первой строкой). */
      unsetCallout: () => ReturnType;
    };
  }
}

const isCallout = (n: PMNode) => n.type.name === 'callout';

/** Тип выноски, в которой стоит курсор (или null). */
export function activeCallout(state: EditorState): string | null {
  return (findParentNode(isCallout)(state.selection)?.node.attrs.kind as string | undefined) ?? null;
}

/** Набрал «[!def] » (или «> [!def] ») в начале строки — строка становится выноской. Тип и «+/-» — как в CALLOUT_HEAD. */
const CALLOUT_INPUT = /^>?[ \t]?\[!([A-Za-z][\w-]{0,30})\]([+-]?)\s$/;

function focusTitle(editor: Editor, pos: number) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    const el = editor.view.nodeDOM(pos) as HTMLElement | null;
    el?.querySelector<HTMLInputElement>('.callout-title')?.focus();
  });
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      kind: { default: 'def', parseHTML: (el) => (el.getAttribute('data-callout') || 'def').toLowerCase(), renderHTML: (a) => ({ 'data-callout': a.kind }) },
      fold: { default: '', parseHTML: (el) => (/^[+-]$/.test(el.getAttribute('data-fold') ?? '') ? el.getAttribute('data-fold') : ''), renderHTML: (a) => (a.fold ? { 'data-fold': a.fold } : {}) },
      title: { default: '', parseHTML: (el) => el.getAttribute('data-title') ?? '', renderHTML: (a) => (a.title ? { 'data-title': a.title } : {}) }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: (el: HTMLElement) => el.querySelector<HTMLElement>(':scope > [data-callout-body]') ?? el }];
  },

  // HTML для буфера (Word, Google Docs): заголовок виден текстом; при вставке обратно в конспект узел собирается по data-атрибутам.
  renderHTML({ node, HTMLAttributes }) {
    const look = calloutLook(node.attrs.kind);
    const head = `${look.icon ? look.icon + ' ' : ''}${node.attrs.title || look.title}`;
    return ['div', mergeAttributes(HTMLAttributes), ['div', { 'data-callout-title': '' }, head], ['div', { 'data-callout-body': '' }, 0]];
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => calloutStart(src) ?? -1,
    tokenize: (src, _tokens, lexer) => {
      const m = matchCallout(src);
      if (!m) return undefined;
      // Внутри списка marked отдаёт абзацы как «text» — в выноске это всё равно абзацы.
      const tokens = lexer.blockTokens(m.body).map((t) => (t.type === 'text' && t.tokens ? { ...t, type: 'paragraph' } : t));
      return { type: 'callout', raw: m.raw, kind: m.kind, fold: m.fold, title: m.title, tokens };
    }
  },

  parseMarkdown: (token, h) => {
    const parse = h.parseBlockChildren ?? h.parseChildren;
    const content = parse(token.tokens ?? []);
    return h.createNode('callout', { kind: token.kind, fold: token.fold ?? '', title: token.title ?? '' }, content.length ? content : [{ type: 'paragraph' }]);
  },

  renderMarkdown: (node, h) => {
    const attrs = node.attrs ?? {};
    const head = calloutHeadLine(String(attrs.kind || 'def'), (attrs.fold ?? '') as CalloutFold, String(attrs.title ?? ''));
    const parts: string[] = [];
    (node.content ?? []).forEach((child, index) => {
      const md = h.renderChild?.(child, index) ?? h.renderChildren([child]);
      parts.push(md);
    });
    // Пустая выноска — одна строка-заголовок (так её пишет и Obsidian).
    if (parts.every((p) => !p.trim())) return head;
    const body = parts.map((p) => p.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n')).join('\n>\n');
    return `${head}\n${body}`;
  },

  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ state, tr, dispatch, commands }) => {
          const k = kind.toLowerCase();
          const inCallout = findParentNode(isCallout)(state.selection);
          if (inCallout) {
            if (dispatch) tr.setNodeMarkup(inCallout.pos, undefined, { ...inCallout.node.attrs, kind: k });
            return true;
          }
          const quote = findParentNode((n) => n.type.name === 'blockquote')(state.selection);
          if (quote) {
            if (dispatch) tr.setNodeMarkup(quote.pos, this.type, { kind: k, fold: '', title: '' });
            return true;
          }
          return commands.wrapIn(this.type, { kind: k, fold: '', title: '' });
        },
      unsetCallout:
        () =>
        ({ state, tr, dispatch }) => {
          const found = findParentNode(isCallout)(state.selection);
          if (!found) return false;
          if (dispatch) {
            const title = String(found.node.attrs.title ?? '').trim();
            const p = state.schema.nodes.paragraph;
            const content = title && p ? Fragment.from(p.create(null, state.schema.text(title))).append(found.node.content) : found.node.content;
            tr.replaceWith(found.pos, found.pos + found.node.nodeSize, content);
          }
          return true;
        }
    };
  },

  addInputRules() {
    const type = this.type;
    const editor = this.editor;
    return [
      new InputRule({
        find: CALLOUT_INPUT,
        handler: ({ state, range, match }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name !== 'paragraph' || $from.parentOffset !== 0) return null;
          const attrs = { kind: match[1].toLowerCase(), fold: match[2] ?? '', title: '' };
          const tr = state.tr.delete(range.from, range.to);
          // «> » уже сделал рамку, и это её первая строка — рамка становится выноской.
          const parent = $from.depth > 1 ? $from.node(-1) : null;
          if (parent?.type.name === 'blockquote' && $from.index(-1) === 0) {
            const at = $from.before(-1);
            tr.setNodeMarkup(at, type, attrs);
            focusTitle(editor, at);
            return;
          }
          const $p = tr.doc.resolve(tr.mapping.map(range.from));
          const blockRange = $p.blockRange();
          if (!blockRange) return null;
          tr.wrap(blockRange, [{ type, attrs }]);
          focusTitle(editor, blockRange.start);
        }
      })
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Backspace в начале пустой выноски — убрать её (как у рамки).
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty || selection.$from.parentOffset !== 0) return false;
        const found = findParentNode(isCallout)(selection);
        if (!found || found.node.textContent || found.node.childCount > 1 || found.start + 1 !== selection.from) return false;
        return editor.commands.unsetCallout();
      }
    };
  },

  // Шапка выноски: значок (под ним — выбор вида), заголовок (поле), «убрать». В покое шапка выглядит как при чтении —
  // значок и заголовок; название вида и «✕» видны, только когда курсор в выноске или над ней мышь.
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let cur = node;
      const dom = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'callout-head';
      head.contentEditable = 'false';
      const pick = document.createElement('span');
      pick.className = 'callout-pick';
      pick.title = 'Поменять вид выноски';
      const ico = document.createElement('span');
      ico.className = 'callout-ico';
      ico.setAttribute('aria-hidden', 'true');
      const kname = document.createElement('span');
      kname.className = 'callout-kname';
      kname.setAttribute('aria-hidden', 'true');
      const kind = document.createElement('select');
      kind.className = 'callout-kind';
      kind.setAttribute('aria-label', 'Вид выноски');
      pick.append(ico, kname, kind);
      const title = document.createElement('input');
      title.className = 'callout-title';
      title.type = 'text';
      title.setAttribute('aria-label', 'Заголовок выноски');
      title.spellcheck = true;
      const off = document.createElement('button');
      off.type = 'button';
      off.className = 'callout-off';
      off.textContent = '✕';
      off.title = 'Убрать выноску (текст останется)';
      off.setAttribute('aria-label', 'Убрать выноску');
      head.append(pick, title, off);
      const body = document.createElement('div');
      body.className = 'callout-body';
      dom.append(head, body);

      const setAttrs = (patch: Record<string, unknown>) => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...patch }));
      };
      const toBody = () => {
        const pos = getPos();
        if (typeof pos !== 'number') return;
        // focus() TipTap срабатывает кадром позже — буква, набранная сразу после Enter, ушла бы в заголовок.
        editor.view.focus();
        editor.chain().setTextSelection(pos + 2).focus().run();
      };

      const paint = () => {
        const look = calloutLook(cur.attrs.kind);
        dom.setAttribute('data-callout', look.kind);
        dom.toggleAttribute('data-callout-other', !look.known);
        const opts = CALLOUTS.map((c) => [c.type, `${c.icon} ${c.title}`]);
        if (!look.known) opts.push([look.kind, look.title]);
        if (kind.options.length !== opts.length || kind.value !== look.kind) {
          kind.replaceChildren(...opts.map(([v, t]) => new Option(t, v)));
          kind.value = look.kind;
        }
        title.placeholder = look.title;
        ico.textContent = look.icon || '❝';
        kname.textContent = `${look.title} ▾`;
        if (title.value !== cur.attrs.title && document.activeElement !== title) title.value = cur.attrs.title;
        title.disabled = kind.disabled = off.disabled = !editor.isEditable;
      };
      paint();

      kind.addEventListener('change', () => setAttrs({ kind: kind.value }));
      title.addEventListener('input', () => setAttrs({ title: title.value.replace(/\s*\n\s*/g, ' ') }));
      title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'Escape') {
          e.preventDefault();
          toBody();
        }
      });
      off.addEventListener('mousedown', (e) => e.preventDefault());
      off.addEventListener('click', () => {
        const pos = getPos();
        if (typeof pos === 'number') editor.chain().focus().setTextSelection(pos + 2).unsetCallout().run();
      });

      return {
        dom,
        contentDOM: body,
        update(n) {
          if (n.type !== cur.type) return false;
          cur = n;
          paint();
          return true;
        },
        // Шапка — обычные поля формы: ProseMirror их не трогает.
        stopEvent: (e) => head.contains(e.target as globalThis.Node),
        ignoreMutation: (m) => head.contains(m.target)
      };
    };
  }
});

/** [стр. N] — маленькая плашка (не текст): нажатие открывает фото страницы (обработчик — AutoHighlight по .page-ref). */
export const PageChip = Node.create({
  name: 'pageRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { page: { default: 1, parseHTML: (el) => Number(el.getAttribute('data-page')) || 1, renderHTML: (a) => ({ 'data-page': a.page }) } };
  },

  parseHTML() {
    return [{ tag: 'span.page-ref[data-page]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'page-ref', title: 'Открыть фото страницы' }, HTMLAttributes), `стр. ${node.attrs.page}`];
  },

  renderText: ({ node }) => `[стр. ${node.attrs.page}]`,

  markdownTokenizer: {
    name: 'pageRef',
    level: 'inline',
    start: (src: string) => pageChipStart(src) ?? -1,
    tokenize: (src) => {
      const m = PAGE_CHIP_AT.exec(src);
      return m ? { type: 'pageRef', raw: m[0], page: Number(m[1] ?? m[2]) } : undefined;
    }
  },

  parseMarkdown: (token, h) => h.createNode('pageRef', { page: Number(token.page) || 1 }),

  renderMarkdown: (node) => `[стр. ${Number(node.attrs?.page) || 1}]`,

  addInputRules() {
    return [nodeInputRule({ find: /\[стр\.\s*(\d{1,4})\]$/, type: this.type, getAttributes: (m) => ({ page: Number(m[1]) }) })];
  }
});

const unsureKey = new PluginKey<DecorationSet>('unsureWords');

function unsureDecorations(doc: PMNode): DecorationSet {
  const out: Decoration[] = [];
  const re = new RegExp(MARKS.unsure.source, 'g');
  doc.descendants((n, pos) => {
    if (!n.isText || !n.text?.includes('{?')) return;
    re.lastIndex = 0;
    for (let m = re.exec(n.text); m; m = re.exec(n.text)) out.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'unsure-word', title: 'Неуверенно прочитано — сверь с фото' }));
  });
  return DecorationSet.create(doc, out);
}

/** {?слово?} — неуверенно прочитанное слово «Тетради»: в редакторе остаётся текстом, но с подсветкой. */
export const UnsureWords = Extension.create({
  name: 'unsureWords',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: unsureKey,
        state: {
          init: (_c, state) => unsureDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? unsureDecorations(tr.doc) : old)
        },
        props: { decorations: (state) => unsureKey.getState(state) }
      })
    ];
  }
});
