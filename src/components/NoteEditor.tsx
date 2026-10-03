import '../katexCache';
// Редактор конспекта «как в Word»: без значков разметки на экране, но хранится всё в Markdown.
import { registerNote } from '../noteRegistry';
import { Extension, InputRule } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { renderTableToMarkdown, Table, TableKit } from '@tiptap/extension-table';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from '@tiptap/markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { barUnreachable, visibleTopOf } from '../floatBar';
import type { HighlightSettings } from '../types';
import { AutoHighlight, autoHighlightKey, findTextRange } from './autoHighlight';
import type { RuleMatcher } from '../rules';
import { VideoImage } from './videoNode';
import { LinkPicker, openMnemaLink } from './Links';
import { parseVideo, VIDEO_ALT } from '../video';
import { DRAWING_ALT, DrawingEditor, drawingToSvg, parseDrawing, svgToDataUri, type DrawingData } from './Drawing';
import { FormulaEditor } from './lazy';
import { HandFormulaPad } from './HandFormulaPad';
import { keyFor, matches, prettyCombo, type KeyAction } from '../keys';
import { getData } from '../store';
import { Icon, Modal, touchUI, usePresence } from './ui';

/** $формула$ в тексте сразу превращается в формулу. */
const DollarMath = Extension.create({
  name: 'dollarMath',
  addInputRules() {
    const type = this.editor.schema.nodes.inlineMath;
    return [
      new InputRule({
        find: /(?<![$\\])\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, type.create({ latex: match[1] }));
        }
      })
    ];
  }
});

/** Жирный, курсив, маркер не «прилипают»: поставил курсор в конец жирного слова и печатаешь — текст обычный.
 *  (Если нажал Ctrl+B и печатаешь — жирный продолжается, пока сам не выключишь.) */
const STICKY = ['bold', 'italic', 'highlight', 'strike', 'underline', 'code'];
export const NoStickyMarks = Extension.create({
  name: 'noStickyMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(trs, _old, state) {
          if (trs.some((t) => t.docChanged) || !trs.some((t) => t.selectionSet)) return null;
          const sel = state.selection;
          if (!sel.empty || state.storedMarks) return null;
          const marks = sel.$from.marks();
          const after = sel.$from.nodeAfter?.marks ?? [];
          const keep = marks.filter((m) => !STICKY.includes(m.type.name) || m.isInSet(after));
          return keep.length === marks.length ? null : state.tr.setStoredMarks(keep);
        }
      })
    ];
  }
});

/** Слово под точкой (для правой кнопки без выделения). */
function wordAt(editor: Editor, pos: number): { from: number; to: number } | null {
  const $p = editor.state.doc.resolve(pos);
  if (!$p.parent.isTextblock) return null;
  const text = $p.parent.textBetween(0, $p.parent.content.size, undefined, '\ufffc');
  const i = $p.parentOffset;
  const isW = (ch: string | undefined) => Boolean(ch && /[\p{L}\p{N}_\-]/u.test(ch));
  let a = i;
  let b = i;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  if (a === b) return null;
  const start = $p.start();
  return { from: start + a, to: start + b };
}

const coarse = () => touchUI();

/** Действия над выделенным текстом: из панели выделения, из меню Android и с клавиатуры. */
export type SelAction = 'bold' | 'italic' | 'mark' | 'heading' | 'list' | 'quote' | 'copy' | 'card' | 'link' | 'rule';

/** Пункты для меню выделения Android — в порядке важности (первые видны сразу, остальные — под «⋮»). */
const SEL_MENU: { id: SelAction; title: string }[] = [
  { id: 'card', title: 'В карточку' },
  { id: 'mark', title: 'Маркер' },
  { id: 'bold', title: 'Жирный' },
  { id: 'rule', title: 'Правило' },
  { id: 'link', title: 'Ссылка' },
  { id: 'italic', title: 'Курсив' },
  { id: 'heading', title: 'Заголовок' }
];

declare global {
  interface Window {
    __mnemaSelAction?: (a: string) => void;
  }
}

/** Текст выделения; формулы превращаются в $…$, чтобы попасть в карточку. */
export function selectionText(editor: Editor): string {
  const { from, to } = editor.state.selection;
  return editor.state.doc.textBetween(from, to, '\n', (node: PMNode) => {
    if (node.type.name === 'inlineMath') return `$${node.attrs.latex}$`;
    if (node.type.name === 'blockMath') return `$$${node.attrs.latex}$$`;
    return '';
  });
}

/** Несколько строк конспекта до и после места рисунка — чтобы предпросмотр был «как в конспекте». */
function drawingContext(editor: Editor, pos: number, isNode: boolean): { before: string; after: string } {
  const doc = editor.state.doc;
  const p = Math.max(0, Math.min(pos, doc.content.size));
  const leaf = (node: PMNode) => (node.type.name === 'inlineMath' || node.type.name === 'blockMath' ? node.attrs.latex : '');
  const before = doc.textBetween(Math.max(0, p - 400), p, '\n', leaf).split('\n').slice(-3).join('\n');
  // p + 1 — пропустить сам рисунок (правка); для нового рисунка текст начинается прямо с курсора.
  const from = Math.min(doc.content.size, isNode ? p + 1 : p);
  const after = doc.textBetween(from, Math.min(doc.content.size, from + 400), '\n', leaf).split('\n').slice(0, 3).join('\n');
  return { before: before.slice(-280), after: after.slice(0, 280) };
}

type FormulaTarget = { mode: 'new'; latex?: string } | { mode: 'edit'; pos: number; latex: string; block: boolean };
type DrawingTarget = { mode: 'new' } | { mode: 'edit'; pos: number; data: DrawingData };

export interface NoteApi {
  showText: (text: string) => void;
}

interface Props {
  markdown: string;
  onChange: (md: string) => void;
  onMakeCard: (text: string) => void;
  highlight?: HighlightSettings | null;
  onPage?: (n: number) => void;
  tools?: ReactNode;
  onReady?: (api: NoteApi) => void;
  /** Слова-подсказки правил предмета: подчёркиваются, при наведении всплывает правило. */
  rules?: RuleMatcher | null;
  onRuleHover?: (id: string | null, el: HTMLElement | null) => void;
  /** «Правило» в панели выделения. */
  onAddRule?: (text: string) => void;
  /** Ссылки на темы, правила и термины: наведение показывает, что там. */
  onLinkHover?: (href: string | null, el: HTMLElement | null) => void;
  topicId?: string;
}


/** Таблица, которая не ломается от «|» в ячейке (|x|, «A | B»): в Markdown он пишется как «\|». */
const PipeSafeTable = Table.extend({
  renderMarkdown: (node, h) =>
    renderTableToMarkdown(node, {
      ...h,
      renderChildren: (...args: Parameters<typeof h.renderChildren>) => h.renderChildren(...args).replace(/(?<!\\)\|/g, '\\|')
    })
});

/** Длинный конспект (много блоков) помечаем: у него блоки вне экрана не раскладываются и не перерисовываются (см. .note-doc[data-long] в styles.css). */
const LONG_NOTE_BLOCKS = 40;
function markLong(ed: Editor) {
  if (ed.isDestroyed) return;
  const dom = ed.view.dom;
  if (ed.state.doc.childCount >= LONG_NOTE_BLOCKS) dom.setAttribute('data-long', '');
  else dom.removeAttribute('data-long');
}

export function NoteEditor({ markdown, onChange, onMakeCard, highlight = null, onPage, tools, onReady, rules = null, onRuleHover, onAddRule, onLinkHover, topicId }: Props) {
  const linkHoverRef = useRef(onLinkHover);
  linkHoverRef.current = onLinkHover;
  const linkEl = useRef<HTMLElement | null>(null);
  const [linkAsk, setLinkAsk] = useState<{ text: string; from: number; to: number; has: boolean } | null>(null);
  // Панель выделения на компьютере появляется только по правой кнопке мыши (на телефоне — сразу при выделении).
  const bubbleAt = useRef<{ from: number; to: number } | null>(null);
  const bubbleKey = useRef(new PluginKey('noteBubble')).current;
  const tableKey = useRef(new PluginKey('noteTable')).current;
  const hlRef = useRef(highlight);
  hlRef.current = highlight;
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const hoverRef = useRef(onRuleHover);
  hoverRef.current = onRuleHover;
  const hoverEl = useRef<HTMLElement | null>(null);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const [formula, setFormula] = useState<FormulaTarget | null>(null);
  const [drawing, setDrawing] = useState<DrawingTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pad, setPad] = useState(false);
  const [videoAsk, setVideoAsk] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onMakeCardRef = useRef(onMakeCard);
  onMakeCardRef.current = onMakeCard;
  const askLinkRef = useRef<() => void>(() => {});
  const onAddRuleRef = useRef(onAddRule);
  onAddRuleRef.current = onAddRule;
  const selActionRef = useRef<(a: SelAction) => void>(() => {});
  // Есть ли сейчас выделенный текст (на телефоне — кнопка «Выделенное» в панели инструментов).
  const [hasSel, setHasSel] = useState(false);
  // Панель выделения показывает, что уже включено (жирный, маркер…) — перерисовываем её, пока она открыта.
  const [, repaint] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, protocols: ['mnema'], isAllowedUri: (url, c) => url.startsWith('mnema://') || c.defaultValidate(url) } }),
      Highlight,
      VideoImage.configure({ allowBase64: true, inline: true }),
      InlineMath.configure({
        katexOptions: { throwOnError: false },
        onClick: (node, pos) => setFormula({ mode: 'edit', pos, latex: node.attrs.latex, block: false })
      }),
      BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: (node, pos) => setFormula({ mode: 'edit', pos, latex: node.attrs.latex, block: true })
      }),
      // Таблицы (в Markdown — | a | b |): вставка через «Вставить → Таблица», строки и столбцы — кнопками над таблицей.
      TableKit.configure({ table: false }),
      PipeSafeTable.configure({ resizable: false }),
      DollarMath,
      NoStickyMarks,
      AutoHighlight(
        () => hlRef.current,
        (n) => onPageRef.current?.(n),
        () => rulesRef.current
      ),
      Placeholder.configure({ placeholder: coarse() ? 'Пиши конспект своими словами. Выдели фразу — и сделай из неё карточку.' : 'Пиши конспект своими словами. Выдели фразу и нажми правую кнопку мыши — сделай из неё карточку.' }),
      Markdown
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: { class: 'note-doc', spellcheck: 'true' },
      // Вставил ссылку на видео — появился плеер.
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
        if (!text || /\s/.test(text) || !parseVideo(text)) return false;
        const node = view.state.schema.nodes.image.create({ src: text, alt: VIDEO_ALT });
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      },
      handleDoubleClickOn: (_view, pos, node) => {
        if (node.type.name === 'image') {
          const data = parseDrawing(node.attrs.src);
          if (data) {
            setDrawing({ mode: 'edit', pos, data });
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => {
      markLong(ed);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onChangeRef.current(ed.getMarkdown()), 300);
    }
  });

  // Панель выделения плавно «подъезжает», когда текст под ней перестроился (список, рамка), а не прыгает.
  // Плавность включается, только когда панель уже показана и не идёт прокрутка: иначе она вылетала бы из угла или отставала от текста.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let tries = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const attach = () => {
      const el = document.querySelector<HTMLElement>('.bubble.sel-panel');
      if (!el) {
        if (tries++ < 30) retry = setTimeout(attach, 100); // панель появляется в DOM чуть позже редактора
        return;
      }
      cleanup = watch(el);
    };
    const watch = (el: HTMLElement) => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    let still: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const shown = el.style.visibility === 'visible' && el.style.opacity !== '0';
      if (shown) {
        if (!settle && el.dataset.settled === undefined) settle = setTimeout(() => ((el.dataset.settled = ''), (settle = undefined)), 260);
      } else {
        clearTimeout(settle);
        settle = undefined;
        delete el.dataset.settled;
      }
    };
    const onScroll = () => {
      el.dataset.scrolling = '';
      clearTimeout(still);
      still = setTimeout(() => delete el.dataset.scrolling, 160);
    };
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('scroll', onScroll, true);
    sync();
    return () => {
      mo.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      clearTimeout(settle);
      clearTimeout(still);
    };
    };
    attach();
    return () => {
      clearTimeout(retry);
      cleanup?.();
    };
  }, [editor]);
  useEffect(() => {
    if (editor) markLong(editor);
  }, [editor]);

  // Сохранить несохранённое при уходе со страницы.
  useEffect(
    () => () => {
      clearTimeout(saveTimer.current);
      if (editor && !editor.isDestroyed) onChangeRef.current(editor.getMarkdown());
    },
    [editor]
  );

  // Следим за выделением: на телефоне кнопка «Выделенное» становится активной, а в меню Android
  // (Копировать / Вставить…) добавляются «В карточку», «Маркер» и другие.
  useEffect(() => {
    if (!editor) return;
    const api = window.mnemaApi;
    const onSel = () => setHasSel(!editor.state.selection.empty);
    const onFocus = () => api?.setSelMenu?.(onAddRuleRef.current ? SEL_MENU : SEL_MENU.filter((x) => x.id !== 'rule'));
    const onBlur = () => api?.setSelMenu?.([]);
    // Пункт из меню Android — только если сейчас пишешь именно в этом конспекте (иначе выделение старое).
    window.__mnemaSelAction = (a: string) => {
      if (editor.isFocused || editor.view.hasFocus()) selActionRef.current(a as SelAction);
    };
    // Нажал «Жирный» в открытой панели — подсветка кнопки должна поменяться сразу.
    const onTr = () => bubbleAt.current && repaint();
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onTr);
    editor.on('focus', onFocus);
    editor.on('blur', onBlur);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onTr);
      editor.off('focus', onFocus);
      editor.off('blur', onBlur);
      api?.setSelMenu?.([]);
      window.__mnemaSelAction = undefined;
    };
  }, [editor]);

  // Настройки подсветки поменялись — перерисовать.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(autoHighlightKey, true));
  }, [editor, highlight, rules?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor || !onReady) return;
    onReady({
      showText: (text) => {
        const r = findTextRange(editor.state.doc, text);
        if (!r) return;
        editor.chain().focus().setTextSelection(r).scrollIntoView().run();
        const dom = editor.view.domAtPos(r.from).node as HTMLElement;
        const el = (dom.nodeType === 3 ? dom.parentElement : dom) as HTMLElement | null;
        // Прокрутить после фокуса: иначе фокус прерывает плавную прокрутку и строка остаётся под панелью.
        // На телефоне снизу открыта панель «Важное» — показываем строку в верхней части экрана.
        requestAnimationFrame(() => el?.scrollIntoView({ block: window.innerWidth <= 720 ? 'start' : 'center', behavior: 'smooth' }));
        el?.classList.add('flash');
        setTimeout(() => el?.classList.remove('flash'), 1200);
      }
    });
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Знакомство может дописать пример в открытый конспект — через редактор, как будто это напечатал человек.
  useEffect(() => {
    if (!editor || !topicId) return;
    return registerNote(topicId, {
      append: (text) => {
        if (editor.isDestroyed) return;
        editor.chain().focus('end').insertContent([{ type: 'paragraph', content: [{ type: 'text', text }] }]).run();
      }
    });
  }, [editor, topicId]);

  // Горячие клавиши конспекта.
  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      // Уже обработано самим редактором (например, Ctrl+Shift+H — маркер): не делать второй раз.
      // Esc прячет панель выделения — даже если редактор уже «съел» клавишу (он отменяет её по умолчанию).
      if (e.key === 'Escape' && bubbleAt.current && !document.querySelector('.modal-back')) {
        bubbleAt.current = null;
        editor.view.dispatch(editor.state.tr.setMeta(bubbleKey, 'hide'));
        return;
      }
      if (e.defaultPrevented || document.querySelector('.modal-back')) return;
      const st = getData().settings;
      const inEditor = editor.view.dom.contains(e.target as Node) || e.target === document.body;
      if (!inEditor && !(e.target as HTMLElement)?.closest?.('.hand-pad')) return;
      if (matches(e, st, 'insertFormula')) {
        e.preventDefault();
        setFormula({ mode: 'new' });
      } else if (matches(e, st, 'handFormula')) {
        e.preventDefault();
        setPad((p) => !p);
      } else if (matches(e, st, 'insertDrawing')) {
        e.preventDefault();
        setDrawing({ mode: 'new' });
      } else if (matches(e, st, 'markText') && !editor.state.selection.empty) {
        e.preventDefault();
        editor.chain().focus().toggleHighlight().run();
      } else if (matches(e, st, 'linkText') && (!editor.state.selection.empty || editor.isActive('link'))) {
        e.preventDefault();
        askLinkRef.current();
      } else if (matches(e, st, 'makeCard')) {
        const { from, to } = editor.state.selection;
        if (from === to) return;
        e.preventDefault();
        const text = selectionText(editor);
        editor.chain().setTextSelection(to).blur().run();
        onMakeCardRef.current(text);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  // Панель инструментов: вверху конспекта, а когда прокрутил вниз — маленький квадратик справа, который раскрывается.
  const barRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  const [floatOpen, setFloatOpen] = useState(false);
  const menuPres = usePresence(menuOpen, 130);
  // «Вставить» закрывается нажатием вне меню или Esc (раньше — только когда мышь уходила с меню: на телефоне оно не закрывалось,
  // а при открытии «⋯» рядом оставалось второе меню).
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.note-insert .menu, [aria-haspopup="menu"][aria-expanded="true"]')) return;
      setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);
  const floatPres = usePresence(floatOpen, 160);
  const padPres = usePresence(pad, 200);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    // Квадратик нужен, только когда ВСЯ панель ушла выше видимого верха области прокрутки
    // (на компьютере это верх окна, на телефоне — под шапкой, в режиме «на весь экран» — под липкой полосой).
    let gone = false;
    let raf = 0;
    const check = () => {
      raf = 0;
      const next = barUnreachable(el.getBoundingClientRect().bottom, visibleTopOf(null, el), gone);
      if (next === gone) return;
      gone = next;
      setFloating(gone);
      if (!gone) setFloatOpen(false);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    // Прокручивается либо .main, либо полноэкранный слой — слушаем оба (scroll не всплывает, поэтому capture на документе).
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor]);
  if (!editor) return null;

  function insertFormula(latex: string, display: boolean) {
    if (!editor) return;
    const f = formula;
    setFormula(null);
    if (f?.mode === 'edit') {
      if (f.block) editor.chain().focus().updateBlockMath({ latex, pos: f.pos }).run();
      else editor.chain().focus().updateInlineMath({ latex, pos: f.pos }).run();
      return;
    }
    if (display) editor.chain().focus().insertBlockMath({ latex }).run();
    else editor.chain().focus().insertInlineMath({ latex }).insertContent(' ').run();
  }

  /** Вставка с панели «от руки»: курсор остаётся после формулы, панель открыта. */
  function insertFromPad(latex: string, display: boolean) {
    if (!editor) return;
    if (display) editor.chain().focus().insertBlockMath({ latex }).run();
    else editor.chain().focus().insertInlineMath({ latex }).insertContent(' ').run();
  }

  function saveDrawing(d: DrawingData) {
    if (!editor) return;
    const src = svgToDataUri(drawingToSvg(d));
    const t = drawing;
    setDrawing(null);
    if (t?.mode === 'edit') {
      editor.chain().focus().setNodeSelection(t.pos).updateAttributes('image', { src }).run();
    } else {
      editor.chain().focus().setImage({ src, alt: DRAWING_ALT }).run();
    }
  }

  /** «Ссылка»: запомнить выделение и открыть выбор, куда ссылаться. */
  function askLink() {
    if (!editor) return;
    let { from, to } = editor.state.selection;
    const has = editor.isActive('link');
    if (has && from === to) {
      editor.chain().extendMarkRange('link').run();
      ({ from, to } = editor.state.selection);
    }
    const text = editor.state.doc.textBetween(from, to, ' ');
    editor.chain().setTextSelection(to).blur().run();
    setLinkAsk({ text, from, to, has });
  }
  function applyLink(href: string | null) {
    const a = linkAsk;
    setLinkAsk(null);
    if (!editor || !a) return;
    const c = editor.chain().focus().setTextSelection({ from: a.from, to: a.to });
    if (href) c.setLink({ href }).run();
    else c.unsetLink().run();
    editor.commands.setTextSelection(a.to);
  }

  /** Одно действие над выделенным — для панели выделения, меню Android и клавиш. */
  function runSel(a: SelAction) {
    if (!editor || editor.state.selection.empty) return;
    const c = editor.chain().focus();
    if (a === 'bold') c.toggleBold().run();
    else if (a === 'italic') c.toggleItalic().run();
    else if (a === 'mark') c.toggleHighlight().run();
    else if (a === 'heading') c.toggleHeading({ level: 2 }).run();
    else if (a === 'list') c.toggleBulletList().run();
    else if (a === 'quote') c.toggleBlockquote().run();
    if (a === 'bold' || a === 'italic' || a === 'mark' || a === 'heading' || a === 'list' || a === 'quote') {
      // «Список» и «Рамка» оборачивают текст в новые блоки — номера позиций сдвигаются. Панель помнит прежние
      // и тогда решала, что выделение другое, и пряталась. Запоминаем выделение заново: панель остаётся на месте.
      if (bubbleAt.current) {
        const { from, to } = editor.state.selection;
        bubbleAt.current = { from, to };
      }
    } else if (a === 'copy') {
      void navigator.clipboard?.writeText(selectionText(editor)).catch(() => document.execCommand('copy'));
      bubbleAt.current = null;
      editor.view.dispatch(editor.state.tr.setMeta(bubbleKey, 'hide'));
    } else if (a === 'link') askLink();
    else {
      const text = selectionText(editor);
      // Снять выделение, чтобы после закрытия окна клик в тексте ставил курсор, а не возвращал старое выделение.
      editor.chain().setTextSelection(editor.state.selection.to).blur().run();
      if (a === 'card') onMakeCard(text);
      else if (text.trim()) onAddRule?.(text.trim());
    }
  }
  askLinkRef.current = askLink;
  selActionRef.current = runSel;

  /** Показать панель выделения (по правой кнопке мыши или кнопкой «Выделенное» на телефоне). */
  function showBubble() {
    if (!editor || editor.state.selection.empty) return;
    const sel = editor.state.selection;
    bubbleAt.current = { from: sel.from, to: sel.to };
    repaint();
    editor.view.dispatch(editor.state.tr.setMeta(bubbleKey, 'show'));
    // Позицию пересчитать, когда панель уже на странице (иначе она считается от пустого места).
    requestAnimationFrame(() => !editor.isDestroyed && editor.view.dispatch(editor.state.tr.setMeta(bubbleKey, 'updatePosition')));
  }

  const hint = (id: KeyAction, bare = false) => {
    if (touchUI()) return '';
    const k = keyFor(getData().settings, id);
    if (!k) return '';
    const t = prettyCombo(k).join('+');
    return bare ? t : ` (${t})`;
  };

  const insert = (fn: () => void) => () => {
    setMenuOpen(false);
    setFloatOpen(false);
    fn();
  };

  function bar(where: 'inline' | 'float') {
    const menuHere = menuPres.mounted && (where === 'float' ? floatOpen : !floatOpen);
    return (
      <>
        {tools}
        {coarse() && (
          <button
            type="button"
            className="btn small sel-tool"
            disabled={!hasSel}
            title="Что сделать с выделенным: жирный, маркер, в карточку…"
            // Не отдавать фокус кнопке — иначе выделение в тексте пропадёт.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setFloatOpen(false);
              showBubble();
            }}
          >
            <Icon name="magic" size={16} /> <span className="tl">Выделенное</span>
          </button>
        )}
        <button type="button" className={'btn small' + (pad ? ' on-tool' : '')} aria-pressed={pad} title={'Формула от руки' + hint('handFormula')} onClick={() => setPad(!pad)}>
          <Icon name="pen" size={16} /> <span className="tl">От руки</span>
        </button>
        <button type="button" className="btn small" title="Вставить формулу, рисунок, видео…" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name="plus" size={16} /> <span className="tl">Вставить</span>
        </button>
        {menuHere && (
          <div className={'menu' + (menuPres.closing ? ' closing' : '')} role="menu">
            <button role="menuitem" onClick={insert(() => setFormula({ mode: 'new' }))}>
              <span className="menu-ico">∑</span> Формула<span className="menu-key">{hint('insertFormula', true)}</span>
            </button>
            <button role="menuitem" onClick={insert(() => setPad(true))}>
              <span className="menu-ico">✍</span> Формула от руки<span className="menu-key">{hint('handFormula', true)}</span>
            </button>
            <button role="menuitem" onClick={insert(() => setDrawing({ mode: 'new' }))}>
              <span className="menu-ico">✎</span> Рисунок<span className="menu-key">{hint('insertDrawing', true)}</span>
            </button>
            <button role="menuitem" onClick={insert(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>
              <span className="menu-ico">▦</span> Таблица
            </button>
            <button role="menuitem" onClick={insert(() => setVideoAsk(true))}>
              <span className="menu-ico">▶</span> Видео по ссылке
            </button>
            <button role="menuitem" onClick={insert(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>
              <span className="menu-ico">H</span> Заголовок
            </button>
            <button role="menuitem" onClick={insert(() => editor.chain().focus().toggleBulletList().run())}>
              <span className="menu-ico">•</span> Список
            </button>
            <button role="menuitem" onClick={insert(() => editor.chain().focus().toggleOrderedList().run())}>
              <span className="menu-ico">1.</span> Нумерованный список
            </button>
            <button role="menuitem" onClick={insert(() => editor.chain().focus().toggleBlockquote().run())}>
              <span className="menu-ico">❝</span> Важное (рамка)
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="note-page">
      <div className="note-insert" ref={barRef}>
        {bar('inline')}
      </div>
      {floating && (
        <div className="note-float">
          <div className={'note-float-inner' + (floatOpen ? ' open' : '')}>
            <button
              type="button"
              className="note-fab"
              aria-label={floatOpen ? 'Спрятать инструменты' : 'Инструменты конспекта'}
              title={floatOpen ? 'Спрятать' : 'Инструменты: Важное, От руки, Вставить…'}
              aria-expanded={floatOpen}
              onClick={() => {
                setFloatOpen(!floatOpen);
                setMenuOpen(false);
              }}
            >
              <Icon name={floatOpen ? 'x' : 'tools'} size={20} />
            </button>
            {floatPres.mounted && <div className={'note-float-panel note-insert' + (floatPres.closing ? ' closing' : '')}>{bar('float')}</div>}
          </div>
        </div>
      )}

      {/* Курсор в таблице — кнопки строк и столбцов над ней. */}
      <BubbleMenu
        editor={editor}
        pluginKey={tableKey}
        className="table-tools"
        options={{ placement: 'top-start', offset: 8, flip: { padding: 12 }, shift: { padding: 8 } }}
        shouldShow={({ editor: ed, from, to }) => from === to && ed.isEditable && ed.isActive('table')}
        getReferencedVirtualElement={() => {
          const cell = editor.view.domAtPos(editor.state.selection.from).node as HTMLElement;
          const table = (cell.nodeType === 3 ? cell.parentElement : cell)?.closest?.('table');
          return table ? { getBoundingClientRect: () => table.getBoundingClientRect(), getClientRects: () => [table.getBoundingClientRect()] as unknown as DOMRectList } : null;
        }}
      >
        <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} title="Добавить строку ниже">
          <Icon name="plus" size={14} /> Строка
        </button>
        <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} title="Добавить столбец справа">
          <Icon name="plus" size={14} /> Столбец
        </button>
        <span className="bubble-sep" />
        <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} title="Убрать строку с курсором">
          − Строка
        </button>
        <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} title="Убрать столбец с курсором">
          − Столбец
        </button>
        <button type="button" className="danger" onClick={() => editor.chain().focus().deleteTable().run()} title="Удалить всю таблицу">
          <Icon name="trash" size={14} />
        </button>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        pluginKey={bubbleKey}
        className="bubble sel-panel"
        // Под выделением: так панель не закрывает кнопки инструментов сверху (если внизу нет места — перепрыгнет наверх).
        options={{ placement: 'bottom', offset: 10, flip: { padding: 12 }, shift: { padding: 8 }, scrollTarget: (document.querySelector('.note-layout.full') as HTMLElement) ?? (document.querySelector('.main') as HTMLElement) ?? window }}
        shouldShow={({ editor: ed, from, to }) => {
          if (from === to || ed.isActive('image') || ed.isActive('inlineMath') || ed.isActive('blockMath')) return false;
          // Само не выскакивает ни на компьютере, ни на телефоне: только по правой кнопке или кнопке «Выделенное».
          const b = bubbleAt.current;
          if (b && b.from === from && b.to === to) return true;
          bubbleAt.current = null;
          return false;
        }}>
        {/* Сверху — оформление (значок и подпись), ниже — что сделать с выделенным. */}
        <div className="sel-fmt">
          {(
            [
              ['bold', 'bold', <b key="b">Ж</b>, 'Жирный'],
              ['italic', 'italic', <i key="i">К</i>, 'Курсив'],
              ['mark', 'highlight', <span key="m" className="mark-ico">М</span>, 'Маркер'],
              ['heading', 'heading', <span key="h" className="head-ico">H</span>, 'Заголовок'],
              ['list', 'bulletList', <span key="l">•≡</span>, 'Список'],
              ['quote', 'blockquote', <span key="q">❝</span>, 'Рамка']
            ] as [SelAction, string, ReactNode, string][]
          ).map(([a, mark, ico, label]) => (
            <button key={a} type="button" className={editor.isActive(mark, mark === 'heading' ? { level: 2 } : undefined) ? 'on' : ''} onClick={() => runSel(a)} aria-label={label} title={label + (a === 'bold' && !touchUI() ? ' (Ctrl+B)' : a === 'italic' && !touchUI() ? ' (Ctrl+I)' : a === 'mark' ? hint('markText') : '')}>
              <span className="sel-ico">{ico}</span>
              <span className="sel-cap">{label}</span>
            </button>
          ))}
        </div>
        <div className="sel-actions">
          <button type="button" className="sel-card" onClick={() => runSel('card')}>
            <Icon name="cardPlus" size={20} />
            <span className="sel-text">
              <b>В карточку</b>
              <small>Сделать вопрос из выделенного</small>
            </span>
            {!touchUI() && <span className="menu-key">{hint('makeCard', true)}</span>}
          </button>
          <button type="button" className={editor.isActive('link') ? 'on' : ''} onClick={() => runSel('link')}>
            <Icon name="link" size={18} />
            <span className="sel-text">
              <b>{editor.isActive('link') ? 'Изменить ссылку' : 'Ссылка'}</b>
              <small>На тему, термин или правило</small>
            </span>
          </button>
          {onAddRule && (
            <button type="button" onClick={() => runSel('rule')}>
              <Icon name="rules" size={18} />
              <span className="sel-text">
                <b>Правило</b>
                <small>Слово будет подсказывать правило</small>
              </span>
            </button>
          )}
          <button type="button" onClick={() => runSel('copy')}>
            <Icon name="copy" size={18} />
            <span className="sel-text">
              <b>Копировать</b>
            </span>
          </button>
        </div>
      </BubbleMenu>

      <div
        className="note-hover-zone"
        onMouseOver={(e) => {
          if (window.matchMedia('(pointer: coarse)').matches) return;
          const t = e.target as HTMLElement;
          const rw = t.closest?.('.rule-word') as HTMLElement | null;
          if (rw !== hoverEl.current && hoverRef.current) {
            hoverEl.current = rw;
            hoverRef.current(rw?.dataset.rule ?? null, rw);
          }
          const a = t.closest?.('a[href^="mnema://"]') as HTMLElement | null;
          if (a !== linkEl.current && linkHoverRef.current) {
            linkEl.current = a;
            linkHoverRef.current(a?.getAttribute('href') ?? null, a);
          }
        }}
        onMouseLeave={() => {
          if (hoverEl.current) hoverRef.current?.(null, null);
          hoverEl.current = null;
          if (linkEl.current) linkHoverRef.current?.(null, null);
          linkEl.current = null;
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          const a = t.closest?.('a[href^="mnema://"]') as HTMLElement | null;
          if (a && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            openMnemaLink(a.getAttribute('href')!);
            return;
          }
          if (!window.matchMedia('(pointer: coarse)').matches) return;
          if (a && linkHoverRef.current) return linkHoverRef.current(a.getAttribute('href'), a);
          const el = t.closest?.('.rule-word') as HTMLElement | null;
          if (el && hoverRef.current) hoverRef.current(el.dataset.rule ?? null, el);
        }}
        onContextMenu={(e) => {
          if (!editor || coarse()) return;
          const at = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
          let { from, to } = editor.state.selection;
          const inside = at && !editor.state.selection.empty && at.pos >= from && at.pos <= to;
          if (!inside) {
            const w = at ? wordAt(editor, at.pos) : null;
            if (!w) return;
            ({ from, to } = w);
          }
          e.preventDefault();
          if (!inside) editor.chain().focus().setTextSelection({ from, to }).run();
          else editor.commands.focus();
          // Выделение в браузере может «доехать» чуть позже правого щелчка — берём то, что получилось.
          setTimeout(() => !editor.isDestroyed && showBubble(), 30);
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {linkAsk && <LinkPicker text={linkAsk.text} currentTopicId={topicId} hasLink={linkAsk.has} onPick={applyLink} onClose={() => setLinkAsk(null)} />}
      {padPres.mounted && (
        <div className={'pad-wrap' + (padPres.closing ? ' closing' : '')}>
          <HandFormulaPad onInsert={insertFromPad} onFix={(latex) => setFormula({ mode: 'new', latex })} onClose={() => setPad(false)} />
        </div>
      )}

      {videoAsk && (
        <VideoLinkDialog
          onClose={() => setVideoAsk(false)}
          onInsert={(url) => {
            setVideoAsk(false);
            editor.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: VIDEO_ALT } }).run();
          }}
        />
      )}

      {formula && (
        <FormulaEditor
          initial={formula.latex ?? ''}
          allowDisplay={formula.mode === 'new'}
          onClose={() => setFormula(null)}
          onInsert={insertFormula}
        />
      )}
      {drawing && (
        <Modal title="Рисунок" onClose={() => setDrawing(null)} width={980} sticky>
          <DrawingEditor initial={drawing.mode === 'edit' ? drawing.data : null} onCancel={() => setDrawing(null)} onSave={saveDrawing} context={drawingContext(editor, drawing.mode === 'edit' ? drawing.pos : editor.state.selection.from, drawing.mode === 'edit')} />
        </Modal>
      )}
    </div>
  );
}

function VideoLinkDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (url: string) => void }) {
  const [url, setUrl] = useState('');
  const info = url.trim() ? parseVideo(url) : null;
  return (
    <Modal title="Видео по ссылке" onClose={onClose}>
      <form
        className="stack gap12"
        onSubmit={(e) => {
          e.preventDefault();
          if (info) onInsert(url.trim());
        }}
      >
        <label className="field">
          <span>Ссылка на видео</span>
          <input className="input" autoFocus placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <span className={'small ' + (url.trim() && !info ? 'hint warn' : 'muted')}>
          {url.trim() && !info ? 'Это не похоже на ссылку на видео. Подходят YouTube, Rutube, VK Видео и файлы .mp4.' : info ? `${info.label} — видео откроется прямо в конспекте.` : 'Подходят YouTube, Rutube, VK Видео и файлы .mp4. Время начала из ссылки (?t=90) сохранится. Ссылку можно просто вставить в конспект — плеер появится сам.'}
        </span>
        <div className="row end gap8">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" disabled={!info}>
            Вставить
          </button>
        </div>
      </form>
    </Modal>
  );
}
