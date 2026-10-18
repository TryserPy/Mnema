import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearDraft, loadDraft, useDraft } from '../drafts';
import { instantiate, problemErrors } from '../problems';
import { clozeCount } from '../srs';
import { addCard, updateCard, updateSettings, useData } from '../store';
import { BUILTIN_TEMPLATES, firstBlank } from '../templates';
import { EDITOR_TIPS, wordCount } from '../tips';
import type { Card, CardTemplate, CardType } from '../types';
import { FormulaEditor } from './lazy';
import { Markdown } from './Markdown';
import { OcclusionEditor } from './Occlusion';
import { occlFront, occlImage, type Occlusion } from '../occlusion';

const TYPES: { value: CardType; label: string; hint: string }[] = [
  { value: 'basic', label: 'Вопрос — ответ', hint: 'Обычная карточка: вопрос спереди, ответ сзади.' },
  { value: 'reverse', label: 'В обе стороны', hint: 'Спросит и «термин → значение», и «значение → термин».' },
  { value: 'cloze', label: 'С пропуском', hint: 'Скрывает слово в предложении — нужно вспомнить его.' },
  { value: 'typing', label: 'Ввести ответ', hint: 'Нужно напечатать точный ответ: дату, число, слово.' },
  { value: 'problem', label: 'Задача с числами', hint: 'Каждый раз новые числа — запоминаешь способ решения, а не ответ.' },
  { value: 'occlusion', label: 'Закрыть часть картинки', hint: 'Схема или карта: закрой подписи рамками — каждая рамка спросит отдельно.' }
];

interface Props {
  topicId: string;
  card?: Card; // редактирование
  initial?: Partial<Pick<Card, 'type' | 'front' | 'back' | 'why' | 'page'>>;
  onDone?: () => void;
  autoFocus?: boolean;
}

type Field = 'front' | 'back' | 'why';

/** Что помнит черновик карточки. */
interface CardDraft {
  type: CardType;
  front: string;
  back: string;
  why: string;
  showWhy: boolean;
  occImg?: string;
  occl?: Occlusion;
}

/** Ключ черновика: новая карточка в теме (из выделенного — ещё и по тексту) или правка своей карточки. */
export function cardDraftKey(topicId: string, card?: Pick<Card, 'id'>, initial?: { front?: string }): string {
  if (card) return `card:${card.id}`;
  const f = initial?.front?.trim();
  if (!f) return `new:${topicId}`;
  let h = 0;
  for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) | 0;
  return `new:${topicId}:${(h >>> 0).toString(36)}`;
}

/** Все формулы $…$ в тексте — для списка «Формулы» с кнопкой «убрать». */
export function formulasIn(text: string): { tex: string; start: number; end: number }[] {
  const out: { tex: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) out.push({ tex: (m[1] ?? m[2]).trim(), start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** Убрать формулу из текста вместе с лишним пробелом на её месте. */
export function removeFormula(text: string, f: { start: number; end: number }): string {
  return (text.slice(0, f.start).replace(/[ \t]+$/, '') + (f.end < text.length && f.start > 0 ? ' ' : '') + text.slice(f.end).replace(/^[ \t]+/, '')).replace(/^ /, '');
}

export function CardEditor({ topicId, card, initial, onDone, autoFocus = true }: Props) {
  const draftKey = cardDraftKey(topicId, card, initial);
  // Черновик восстанавливаем один раз, при открытии; у правки — только если он отличается от самой карточки.
  const restored = useMemo(() => {
    const d = loadDraft<CardDraft>(draftKey)?.value;
    if (!d) return null;
    if (card && d.type === card.type && d.front === card.front && d.back === card.back && d.why === (card.why ?? '')) return null;
    return d;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [type, setType] = useState<CardType>(restored?.type ?? card?.type ?? initial?.type ?? 'basic');
  const [front, setFront] = useState(restored?.front ?? card?.front ?? initial?.front ?? '');
  const [back, setBack] = useState(restored?.back ?? card?.back ?? initial?.back ?? '');
  const [why, setWhy] = useState(restored?.why ?? card?.why ?? initial?.why ?? '');
  // «Закрыть часть картинки»: картинка (в front) и рамки.
  const [occImg, setOccImg] = useState(() => restored?.occImg ?? (card?.type === 'occlusion' ? (occlImage(card.front) ?? '') : ''));
  const [occl, setOccl] = useState<Occlusion>(restored?.occl ?? card?.occl ?? { masks: [], all: true });
  const [showWhy, setShowWhy] = useState(restored?.showWhy ?? Boolean(card?.why || initial?.why));
  const [fromDraft, setFromDraft] = useState(Boolean(restored));
  const draftValue: CardDraft = { type, front, back, why, showWhy, ...(type === 'occlusion' ? { occImg, occl } : {}) };
  // Пустое (или ровно то, что было у карточки) — не черновик.
  const draft = useDraft<CardDraft>(draftKey, draftValue, (v) => {
    if (card) return v.type === card.type && v.front === card.front && v.back === card.back && v.why === (card.why ?? '') && (v.type !== 'occlusion' || JSON.stringify(v.occl) === JSON.stringify(card.occl));
    const blank = !v.front.trim() && !v.back.trim() && !v.why.trim() && !v.occImg && !v.occl?.masks.length;
    const same = Boolean(initial) && v.type === (initial?.type ?? 'basic') && v.front === (initial?.front ?? '') && v.back === (initial?.back ?? '') && v.why === (initial?.why ?? '');
    return blank || same;
  });
  const [saved, setSaved] = useState(false);
  const [formulaFor, setFormulaFor] = useState<Field | null>(null);
  const [exampleSeed, setExampleSeed] = useState(7);
  const refs = { front: useRef<HTMLTextAreaElement>(null), back: useRef<HTMLTextAreaElement>(null), why: useRef<HTMLTextAreaElement>(null) };
  const lastField = useRef<Field>('front');
  const setters: Record<Field, (v: string) => void> = { front: setFront, back: setBack, why: setWhy };
  const values: Record<Field, string> = { front, back, why };

  useEffect(() => {
    if (autoFocus) refs.front.current?.focus();
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const clozes = type === 'cloze' ? clozeCount(front) : 0;
  const probErrors = type === 'problem' ? problemErrors(front, back) : [];
  const canSave = type === 'occlusion' ? Boolean(occImg) && occl.masks.length > 0 : front.trim().length > 0 && (type === 'cloze' ? clozes > 0 : back.trim().length > 0) && probErrors.length === 0;
  const example = type === 'problem' && probErrors.length === 0 && front.trim() ? instantiate(front, back, exampleSeed) : null;
  const longAnswer = type !== 'cloze' && wordCount(back) > 25;
  const hasMath = /\$[^$]+\$/.test(front + back + why);
  const formulas = (['front', 'back', 'why'] as Field[]).flatMap((field) => (field === 'why' && !showWhy ? [] : formulasIn(values[field]).map((f) => ({ ...f, field }))));
  const whyId = useId();

  function makeCloze() {
    const el = refs.front.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s === e) return;
    setFront(front.slice(0, s) + '{{' + front.slice(s, e) + '}}' + front.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(e + 4, e + 4);
    });
  }

  function insertFormula(latex: string) {
    const f = formulaFor ?? 'front';
    setFormulaFor(null);
    const el = refs[f].current;
    const v = values[f];
    const pos = el ? el.selectionStart : v.length;
    const ins = `$${latex}$`;
    setters[f](v.slice(0, pos) + ins + v.slice(el ? el.selectionEnd : v.length));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + ins.length, pos + ins.length);
    });
  }

  function save() {
    if (!canSave) return;
    const payload = type === 'occlusion' ? { type, front: occlFront(occImg), back: back.trim(), why: why.trim() || undefined, occl } : { type, front: front.trim(), back: back.trim(), why: why.trim() || undefined, occl: undefined, ...(initial?.page && !card ? { page: initial.page } : {}) };
    draft.discard();
    setFromDraft(false);
    if (card) {
      updateCard(card.id, payload);
      onDone?.();
    } else {
      addCard({ topicId, ...payload });
      setFront('');
      setBack('');
      setWhy('');
      setOccImg('');
      setOccl({ masks: [], all: occl.all });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      refs.front.current?.focus();
      if (initial) onDone?.();
    }
  }

  const typeInfo = TYPES.find((t) => t.value === type)!;
  const settings = useData().settings;
  const [naming, setNaming] = useState<string | null>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  function applyTemplate(t: CardTemplate) {
    setType(t.type);
    setFront(t.front);
    setBack(t.back ?? '');
    if (t.why !== undefined) {
      setWhy(t.why);
      setShowWhy(true);
    }
    pendingSel.current = firstBlank(t.front) ?? [t.front.length, t.front.length];
  }
  // После выбора шаблона сразу выделяем первое «___», чтобы печатать поверх
  useLayoutEffect(() => {
    const b = pendingSel.current;
    const el = refs.front.current;
    if (!b || !el) return;
    pendingSel.current = null;
    el.focus();
    el.setSelectionRange(b[0], b[1]);
  });
  function saveTemplate(name: string) {
    const t: CardTemplate = { id: 'u' + Date.now().toString(36), name: name.trim().slice(0, 40) || 'Мой шаблон', type, front, back, ...(why ? { why } : {}) };
    updateSettings({ cardTemplates: [...settings.cardTemplates, t] });
    setNaming(null);
  }

  return (
    <div
      className="editor"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      {!card && (
        <div className="tpl-row" aria-label="Шаблоны">
          <span className="small muted">Шаблон:</span>
          {[...BUILTIN_TEMPLATES, ...settings.cardTemplates].map((t) => (
            <span key={t.id} className={'tpl-chip' + (t.id.startsWith('u') ? ' mine' : '')}>
              <button type="button" onClick={() => applyTemplate(t)} title={t.front}>
                {t.name}
              </button>
              {t.id.startsWith('u') && (
                <button type="button" className="tpl-x" aria-label={`Удалить шаблон ${t.name}`} onClick={() => updateSettings({ cardTemplates: settings.cardTemplates.filter((x) => x.id !== t.id) })}>
                  ×
                </button>
              )}
            </span>
          ))}
          {naming === null ? (
            <button type="button" className="tpl-chip add" disabled={!front.trim()} onClick={() => setNaming('')} title="Сохранить то, что сейчас написано, как свой шаблон">
              <span>+ свой</span>
            </button>
          ) : (
            <form
              className="row gap4"
              onSubmit={(e) => {
                e.preventDefault();
                saveTemplate(naming);
              }}
            >
              <input className="input tiny" autoFocus placeholder="Название шаблона" value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNaming(null)} />
              <button className="btn small" type="submit">
                Сохранить
              </button>
            </form>
          )}
        </div>
      )}
      {fromDraft && (
        <div className="hint info row gap8 wrap draft-note" role="status" data-part="draft-restored">
          <span className="grow">Черновик восстановлен — продолжай с того места, где остановился.</span>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              clearDraft(draftKey);
              setFromDraft(false);
              setType(card?.type ?? initial?.type ?? 'basic');
              setFront(card?.front ?? initial?.front ?? '');
              setBack(card?.back ?? initial?.back ?? '');
              setWhy(card?.why ?? initial?.why ?? '');
              setShowWhy(Boolean(card?.why || initial?.why));
              setOccImg(card?.type === 'occlusion' ? (occlImage(card.front) ?? '') : '');
              setOccl(card?.occl ?? { masks: [], all: true });
            }}
          >
            Удалить черновик
          </button>
        </div>
      )}
      <label className="type-select">
        <span className="small muted">Тип</span>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as CardType)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="small muted grow">{typeInfo.hint}</span>
      </label>

      {type === 'occlusion' && <OcclusionEditor img={occImg} occl={occl} onImage={setOccImg} onChange={setOccl} />}
      {type !== 'occlusion' && (
      <label className="field">
        <span>{type === 'cloze' ? 'Предложение' : type === 'reverse' ? 'Термин' : 'Вопрос'}</span>
        <textarea
          ref={refs.front}
          rows={type === 'cloze' ? 3 : 2}
          value={front}
          onFocus={() => (lastField.current = 'front')}
          onChange={(e) => setFront(e.target.value)}
          placeholder={type === 'cloze' ? 'Сила тока прямо пропорциональна напряжению' : type === 'reverse' ? 'Фотосинтез' : type === 'problem' ? 'Напряжение {U=10..220} В, сопротивление {R=2..50} Ом. Найди силу тока.' : 'Что такое фотосинтез?'}
        />
        {type === 'problem' && <span className="small muted">Изменяемые числа пиши так: {'{U=10..220}'} — от 10 до 220; с шагом: {'{m=0.5..5:0.5}'}.</span>}
      </label>
      )}
      {type === 'cloze' && (
        <div className="row gap8 small muted wrap">
          <button type="button" className="btn small" onMouseDown={(e) => e.preventDefault()} onClick={makeCloze}>
            Скрыть выделенное слово
          </button>
          <span>{clozes === 0 ? 'Выдели слово, которое нужно вспомнить, и нажми кнопку.' : `Скрыто слов: ${clozes}. Каждое спросит отдельно.`}</span>
        </div>
      )}
      {type !== 'cloze' && (
        <label className="field">
          <span>{type === 'typing' ? 'Точный ответ' : type === 'reverse' ? 'Значение' : type === 'problem' ? 'Решение и ответ' : type === 'occlusion' ? 'Общее пояснение ко всей картинке (необязательно, не ответ рамки)' : 'Ответ'}</span>
          <textarea ref={refs.back} rows={type === 'typing' ? 1 : 3} value={back} onFocus={() => (lastField.current = 'back')} onChange={(e) => setBack(e.target.value)} placeholder={type === 'typing' ? 'кислород' : type === 'problem' ? 'I = U / R = {=U/R} А' : ''} />
          {type === 'problem' && <span className="small muted">Ответ считай формулой в фигурных скобках со знаком =: {'{=U/R}'}. Можно: + − * / ^, скобки, sqrt(), sin() в градусах, pi, g = 9,8.</span>}
          {type === 'typing' && <span className="small muted">Несколько верных вариантов пиши через | например: кислород|O2</span>}
        </label>
      )}
      {showWhy ? (
        <div className="field">
          <div className="row gap8 field-head">
            <label htmlFor={whyId} className="grow">
              Почему это так? (необязательно)
            </label>
            {/* Убрать блок: объяснение не сохранится в карточку (пустое поле тоже не сохраняется). */}
            <button
              type="button"
              className="icon-btn small"
              aria-label="Убрать объяснение «почему»"
              title="Убрать объяснение"
              onClick={() => {
                setWhy('');
                setShowWhy(false);
                if (lastField.current === 'why') lastField.current = 'front';
              }}
            >
              ×
            </button>
          </div>
          <textarea id={whyId} ref={refs.why} rows={2} value={why} onFocus={() => (lastField.current = 'why')} onChange={(e) => setWhy(e.target.value)} placeholder="Объяснение, которое связывает факт с тем, что ты уже знаешь" />
        </div>
      ) : null}
      {formulas.length > 0 && (
        <div className="formula-list" aria-label="Формулы в карточке">
          <span className="small muted">Формулы:</span>
          {formulas.map((f) => (
            <span key={f.field + f.start} className="formula-chip">
              <Markdown text={`$${f.tex}$`} className="formula-chip-tex" />
              <button type="button" className="tpl-x" aria-label={`Убрать формулу ${f.tex}`} title="Убрать формулу" onClick={() => setters[f.field](removeFormula(values[f.field], f))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row gap12 wrap">
        {!showWhy && (
          <button type="button" className="link-btn" onClick={() => setShowWhy(true)}>
            + Объяснение «почему»
          </button>
        )}
        <button type="button" className="link-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setFormulaFor(lastField.current)}>
          + Формула
        </button>
      </div>
      {hasMath && type !== 'problem' && (
        <div className="math-preview small">
          <span className="muted">Так будет выглядеть:</span>
          <Markdown text={front.replace(/\{\{(.+?)(::.*?)?\}\}/g, '$1')} />
          {type !== 'cloze' && back && <Markdown text={back} className="muted-md" />}
        </div>
      )}
      {type === 'problem' && front.trim() && back.trim() && (
        <div className="math-preview small problem-preview">
          {probErrors.length > 0 ? (
            <span className="warn-text">{probErrors[0]}</span>
          ) : (
            example && (
              <>
                <div className="row between">
                  <span className="muted">Пример, как увидишь при повторении:</span>
                  <button type="button" className="link-btn small" onClick={() => setExampleSeed((x) => x + 1)}>
                    Другие числа
                  </button>
                </div>
                <Markdown text={example.question} />
                <Markdown text={example.answer} className="muted-md" />
              </>
            )
          )}
        </div>
      )}
      {longAnswer && type !== 'problem' && <div className="hint warn">{EDITOR_TIPS.longAnswer}</div>}
      <div className="row gap8 end wrap">
        {saved && <span className="muted small">Добавлено ✓</span>}
        {onDone && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              // «Отмена» — явный отказ: черновик стирается (закрытие крестиком или уход с экрана его сохраняют).
              draft.discard();
              onDone();
            }}
          >
            Отмена
          </button>
        )}
        <button type="button" className="btn primary" disabled={!canSave} onClick={save} title="Ctrl+Enter">
          {card ? 'Сохранить' : 'Добавить'}
        </button>
      </div>
      {formulaFor && <FormulaEditor allowDisplay={false} onClose={() => setFormulaFor(null)} onInsert={(l) => insertFormula(l)} />}
    </div>
  );
}
