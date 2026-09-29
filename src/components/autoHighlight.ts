// Подсветка важного прямо в конспекте (не сохраняется в тексте) и «чипы» ссылок на страницы.
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findInText } from '../important';
import type { HighlightSettings } from '../types';
import { findRuleWords, type RuleMatcher } from '../rules';

export const autoHighlightKey = new PluginKey('mnemaAutoHighlight');

/** Текст блока и позиция в документе для каждого символа (формулы и картинки пропускаются). */
export function blockText(block: PMNode, blockPos: number): { text: string; pos: number[] } {
  let text = '';
  const pos: number[] = [];
  block.forEach((child, offset) => {
    if (child.isText) {
      const t = child.text ?? '';
      for (let i = 0; i < t.length; i++) pos.push(blockPos + 1 + offset + i);
      text += t;
    } else {
      // Атом (формула) — один пробел, чтобы слова не слипались.
      pos.push(blockPos + 1 + offset);
      text += ' ';
    }
  });
  return { text, pos };
}

const PAGE_RE = /\[стр\.\s*(\d{1,4})\]/g;

/** Подсветка одного абзаца. */
function blockDecos(node: PMNode, p: number, hs: HighlightSettings | null, out: Decoration[], rm: RuleMatcher | null = null) {
  const { text, pos } = blockText(node, p);
  if (!text.trim()) return;
  for (const m of text.matchAll(PAGE_RE)) {
    const from = pos[m.index!];
    const to = pos[m.index! + m[0].length - 1] + 1;
    out.push(Decoration.inline(from, to, { class: 'page-ref', 'data-page': m[1], title: 'Открыть фото страницы' }));
  }
  if (hs?.show) {
    for (const r of findInText(text, hs)) {
      if (r.to <= r.from) continue;
      const from = pos[r.from];
      const to = pos[r.to - 1] + 1;
      if (from === undefined || to === undefined) continue;
      out.push(Decoration.inline(from, to, { class: 'ah ah-' + r.type }));
    }
  }
  if (rm) {
    for (const r of findRuleWords(text, rm)) {
      const from = pos[r.from];
      const to = pos[r.to - 1] + 1;
      if (from === undefined || to === undefined) continue;
      out.push(Decoration.inline(from, to, { class: 'rule-word', 'data-rule': r.id }));
    }
  }
}

function build(doc: PMNode, hs: HighlightSettings | null, rm: RuleMatcher | null): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, p) => {
    if (!node.isTextblock) return true;
    blockDecos(node, p, hs, decos, rm);
    return false;
  });
  return DecorationSet.create(doc, decos);
}

/** Пока печатаешь, пересчитываем только изменённые абзацы, а не весь конспект. */
function update(tr: Transaction, old: DecorationSet, hs: HighlightSettings | null, rm: RuleMatcher | null): DecorationSet {
  let set = old.map(tr.mapping, tr.doc);
  const doc = tr.doc;
  const ranges: [number, number][] = [];
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_a, _b, from, to) => ranges.push([rest.map(from, -1), rest.map(to, 1)]));
  });
  const seen = new Set<number>();
  for (const [a, b] of ranges) {
    const from = Math.max(0, Math.min(a, b) - 1);
    const to = Math.min(doc.content.size, Math.max(a, b) + 1);
    doc.nodesBetween(from, to, (node, p) => {
      if (!node.isTextblock) return true;
      if (seen.has(p)) return false;
      seen.add(p);
      set = set.remove(set.find(p, p + node.nodeSize));
      const fresh: Decoration[] = [];
      blockDecos(node, p, hs, fresh, rm);
      if (fresh.length) set = set.add(doc, fresh);
      return false;
    });
  }
  return set;
}

export function AutoHighlight(getSettings: () => HighlightSettings | null, onPage: (n: number) => void, getRules: () => RuleMatcher | null = () => null) {
  return Extension.create({
    name: 'mnemaAutoHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: autoHighlightKey,
          state: {
            init: (_c, state) => build(state.doc, getSettings(), getRules()),
            apply: (tr, old, _o, state) => (tr.getMeta(autoHighlightKey) ? build(state.doc, getSettings(), getRules()) : tr.docChanged ? update(tr, old, getSettings(), getRules()) : old)
          },
          props: {
            decorations(state) {
              return autoHighlightKey.getState(state);
            },
            handleClick(_view, _pos, event) {
              const el = (event.target as HTMLElement).closest?.('.page-ref') as HTMLElement | null;
              if (el && (event.ctrlKey || event.metaKey || event.detail === 1)) {
                onPage(Number(el.dataset.page));
                return true;
              }
              return false;
            }
          }
        })
      ];
    }
  });
}

/** Найти текст в документе и вернуть диапазон (для «Показать» в меню «Важное»). */
export function findTextRange(doc: PMNode, needle: string): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  const low = needle.toLowerCase();
  doc.descendants((node, p) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    const { text, pos } = blockText(node, p);
    const i = text.toLowerCase().indexOf(low);
    if (i >= 0) found = { from: pos[i], to: pos[i + needle.length - 1] + 1 };
    return false;
  });
  return found;
}
