// Настройки → ИИ → Промты: какой шаблон промта брать для задачи со своим ключом и ИИ без интернета, свои шаблоны,
// проверка на встроенном примере страницы. Refrain ИИ отсюда ничего не получает: ему — только «Свои указания».
import { useEffect, useRef, useState } from 'react';
import { composePrompt, estimateTokens, formatLock, hasOwnVersion, PROMPT_VARS, TEMPLATE_FAMILIES, TEMPLATE_TASKS, type TemplateTask } from '../../shared/prompts/templates';
import { AI_NOTE_MAX } from '../aiNotes';
import { parseAiCards } from '../aiCards';
import { aiRequest, type AiTask } from '../aiTasks';
import {
  autoFamily,
  canTryOnSample,
  cleanPromptTemplates,
  familyTitle,
  MY_TEMPLATES_MAX,
  modelForTask,
  parsePromptFile,
  PROMPT_EXT,
  promptFileName,
  promptFileText,
  rememberAiConfig,
  resolveTemplate,
  SAMPLE_PAGE,
  sampleRequestText,
  TASK_TITLES,
  TEMPLATE_NAME_MAX,
  TEMPLATE_TEXT_MAX,
  type PromptPick
} from '../prompts';
import { downloadFile } from '../share';
import { updateSettings, useData, type AiConfig } from '../store';
import { judgeAiAnswer } from '../textbookText';
import type { MyPromptTemplate, PromptTemplates } from '../types';
import { Markdown } from './Markdown';
import { ConfirmButton, toast } from './ui';

const ASK_TASK: Record<TemplateTask, AiTask> = {
  'textbook.summary': 'textbook',
  'textbook.brief': 'textbook',
  'textbook.verbatim': 'textbook',
  'textbook.merge': 'textbook',
  'notebook.read': 'textbook',
  cards: 'cards',
  explain: 'explain',
  formula: 'other'
};

const MAX_TOKENS: Record<TemplateTask, number> = {
  'textbook.summary': 3000,
  'textbook.brief': 2000,
  'textbook.verbatim': 4000,
  'textbook.merge': 4000,
  'notebook.read': 3000,
  cards: 1500,
  explain: 500,
  formula: 300
};

type Trial = { state: 'idle' } | { state: 'busy' } | { state: 'error'; text: string } | { state: 'done'; md: string; note?: string };

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Ответ ИИ на пример → что показать: конспект (рисунки — подписью), карточки списком, объяснение как есть. */
function trialResult(task: TemplateTask, text: string): Trial {
  if (task === 'cards') {
    const cards = parseAiCards(text);
    return cards.length ? { state: 'done', md: cards.map((c) => `- **${c.front}** — ${c.back}`).join('\n'), note: `Карточек: ${cards.length}` } : { state: 'error', text: 'Из ответа не получилось ни одной карточки «Вопрос :: Ответ».' };
  }
  if (task === 'explain') return { state: 'done', md: text.trim() };
  const v = judgeAiAnswer(text.replace(/\[\[\s*РИС\s*(\d+)\.(\d+)[^\]\n]*\]\]/gi, '\n\n*🖼 рисунок со страницы*\n\n'));
  if (!v.ok) return { state: 'error', text: v.why };
  const md = v.parsed.markdown.replace(/⟦РИС:(\d+)⟧/g, (_m, i: string) => `*🖼 рисунок с фото${v.parsed.figures[Number(i)]?.caption ? ' · ' + v.parsed.figures[Number(i)].caption : ''}*`);
  return { state: 'done', md, note: v.parsed.detectedPage ? `Номер страницы найден: ${v.parsed.detectedPage}` : undefined };
}

export function PromptsSettings() {
  const data = useData();
  const settings = cleanPromptTemplates(data.settings.promptTemplates);
  const mine = settings?.mine ?? [];
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [task, setTask] = useState<TemplateTask>('textbook.summary');
  const [trial, setTrial] = useState<Trial>({ state: 'idle' });
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const api = window.mnemaApi;

  useEffect(() => {
    let alive = true;
    void api?.aiGetConfig?.().then(
      (c) => {
        rememberAiConfig(c);
        if (alive) setCfg(c);
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [api]);

  const model = cfg ? modelForTask(cfg, task, data.settings.aiTaskProvider) : null;
  const auto = autoFamily(model);
  const resolved = resolveTemplate(task, settings, auto);
  const own = resolved.mine;

  // Черновик своего шаблона: пишем в поле, в настройки кладём, когда ученик ушёл из поля.
  const [draft, setDraft] = useState<{ id: string; name: string; text: string } | null>(null);
  const editing = own && draft?.id === own.id ? draft : own ? { id: own.id, name: own.name, text: own.text } : null;
  const text = editing ? editing.text : resolved.text;

  const save = (next: PromptTemplates) => updateSettings({ promptTemplates: cleanPromptTemplates(next) });
  const setPick = (t: TemplateTask, pick: PromptPick) => {
    const p = { ...(settings?.pick ?? {}) };
    if (pick === 'auto') delete p[t];
    else p[t] = pick;
    save({ ...settings, pick: p });
    setTrial({ state: 'idle' });
  };
  const putMine = (list: MyPromptTemplate[], pick?: { task: TemplateTask; value: PromptPick }) => {
    const p = { ...(settings?.pick ?? {}) };
    if (pick) p[pick.task] = pick.value;
    save({ pick: p, mine: list });
  };
  const commitDraft = (d = editing) => {
    if (!d || !own) return;
    const name = d.name.trim() || own.name;
    const body = d.text.trim();
    if (!body || (name === own.name && body === own.text)) return;
    putMine(mine.map((m) => (m.id === own.id ? { ...m, name, text: body } : m)));
  };
  const createMine = (from: string, name: string, t: TemplateTask = task) => {
    if (mine.length >= MY_TEMPLATES_MAX) {
      toast(`Своих шаблонов может быть не больше ${MY_TEMPLATES_MAX}.`);
      return;
    }
    const tpl: MyPromptTemplate = { id: newId(), name: name.slice(0, TEMPLATE_NAME_MAX), task: t, text: from.slice(0, TEMPLATE_TEXT_MAX) };
    putMine([...mine, tpl], { task: t, value: `my:${tpl.id}` });
    setTask(t);
    setDraft(null);
    setTrial({ state: 'idle' });
  };

  const insertVar = (name: string) => {
    if (!editing) return;
    const el = area.current;
    const token = `{{${name}}}`;
    const at = el ? el.selectionStart : editing.text.length;
    const end = el ? el.selectionEnd : at;
    const next = { ...editing, text: editing.text.slice(0, at) + token + editing.text.slice(end) };
    setDraft(next);
    commitDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const exportCurrent = () => {
    const name = own ? (editing?.name ?? own.name) : `${familyTitle(resolved.family)} — ${TASK_TITLES[task]}`;
    downloadFile(promptFileName(name), promptFileText({ name, task, text }), 'application/json');
  };
  const importFile = async (f: File) => {
    const r = parsePromptFile(await f.text(), newId());
    if (!r.ok) {
      toast(r.error);
      return;
    }
    createMine(r.template.text, r.template.name, r.template.task as TemplateTask);
    toast(`Шаблон «${r.template.name}» добавлен в «${TASK_TITLES[r.template.task as TemplateTask]}».`);
  };

  const tryOnSample = async () => {
    if (!api?.aiAsk) return;
    setTrial({ state: 'busy' });
    const system = composePrompt(text, task, { subject: SAMPLE_PAGE.subject, topic: SAMPLE_PAGE.topic, page: SAMPLE_PAGE.page }, resolved.family);
    try {
      const r = await api.aiAsk(aiRequest(ASK_TASK[task], { system, text: sampleRequestText(task), maxTokens: MAX_TOKENS[task] }));
      setTrial(r.ok ? trialResult(task, r.text) : { state: 'error', text: r.error });
    } catch (e) {
      setTrial({ state: 'error', text: (e as Error).message || String(e) });
    }
  };

  const tokens = estimateTokens(composePrompt(text, task, { subject: SAMPLE_PAGE.subject, topic: SAMPLE_PAGE.topic, page: SAMPLE_PAGE.page }, resolved.family));
  const pickOf = (t: TemplateTask) => settings?.pick?.[t];

  return (
    <div className="stack gap12 prompts-settings">
      <div className="stack gap4">
        <h3>Промты</h3>
        <span className="small muted">
          Как Refrain просит свой ИИ (по ключу) и ИИ без интернета сделать конспект, карточки и остальное. Шаблон подбирается сам по модели, его можно сменить или написать свой. У Refrain ИИ промт
          менять нельзя — для него есть только «Свои указания» (до {AI_NOTE_MAX} знаков).
        </span>
      </div>
      <div className="row wrap gap16" style={{ alignItems: 'flex-start' }}>
        <nav className="stack gap4" style={{ flex: '1 1 170px' }} aria-label="Задачи ИИ">
          <span className="small muted">Задачи</span>
          {TEMPLATE_TASKS.map((t) => (
            <button
              key={t}
              type="button"
              className={'tree-item' + (t === task ? ' on' : '')}
              aria-current={t === task ? 'true' : undefined}
              onClick={() => {
                commitDraft();
                setTask(t);
                setTrial({ state: 'idle' });
              }}
            >
              <span className="grow">{TASK_TITLES[t]}</span>
              {pickOf(t)?.startsWith('my:') && <span className="small muted">мой</span>}
            </button>
          ))}
          <span className="small muted" title="Промт стиля собирается из справочника стилей: Оформление → Стиль → «Инструкция для ИИ»">
            Стиль — в «Оформлении»
          </span>
          {mine.length > 0 && <span className="small muted mt8">Мои шаблоны</span>}
          {mine.map((m) => (
            <button
              key={m.id}
              type="button"
              className={'tree-item sub' + (own?.id === m.id ? ' on' : '')}
              title={TASK_TITLES[m.task as TemplateTask]}
              onClick={() => {
                commitDraft();
                setTask(m.task as TemplateTask);
                if (pickOf(m.task as TemplateTask) !== `my:${m.id}`) setPick(m.task as TemplateTask, `my:${m.id}`);
                setTrial({ state: 'idle' });
              }}
            >
              <span className="grow">{m.name}</span>
            </button>
          ))}
          <button type="button" className="btn small" onClick={() => createMine(text, `${TASK_TITLES[task]} (${familyTitle(resolved.family)})`)}>
            + Новый шаблон
          </button>
          <button type="button" className="link-btn small" onClick={() => fileInput.current?.click()}>
            Открыть файл {PROMPT_EXT}…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={`${PROMPT_EXT},application/json`}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
        </nav>

        <div className="stack gap8" style={{ flex: '999 1 320px', minWidth: 0 }}>
          <div className="row wrap gap8 between">
            <strong>{TASK_TITLES[task]}</strong>
            <span className="small muted">{model ? `для: ${model.name}${model.model ? ' · ' + model.model : ''}` : api?.aiGetConfig ? 'свой ИИ не настроен' : 'свой ИИ — в приложении'}</span>
          </div>
          <div className="row wrap gap6" role="group" aria-label="Шаблон">
            <button type="button" className={'chip-btn neutral' + (resolved.pick === 'auto' ? ' on' : '')} aria-pressed={resolved.pick === 'auto'} onClick={() => setPick(task, 'auto')}>
              {familyTitle(auto)} (авто)
            </button>
            {TEMPLATE_FAMILIES.filter((f) => f.id !== auto).map((f) => (
              <button
                key={f.id}
                type="button"
                className={'chip-btn neutral' + (resolved.pick === f.id ? ' on' : '')}
                aria-pressed={resolved.pick === f.id}
                title={f.hint + (hasOwnVersion(f.id, task) ? '' : ' Для этой задачи — как «Универсальный».')}
                onClick={() => setPick(task, f.id)}
              >
                {f.title}
              </button>
            ))}
            {mine
              .filter((m) => m.task === task)
              .map((m) => (
                <button key={m.id} type="button" className={'chip-btn neutral' + (own?.id === m.id ? ' on' : '')} aria-pressed={own?.id === m.id} onClick={() => setPick(task, `my:${m.id}`)}>
                  Мой: {m.name}
                </button>
              ))}
          </div>

          {editing && (
            <input
              className="input"
              value={editing.name}
              maxLength={TEMPLATE_NAME_MAX}
              aria-label="Название шаблона"
              onChange={(e) => setDraft({ ...editing, name: e.target.value })}
              onBlur={() => commitDraft()}
            />
          )}
          <textarea
            ref={area}
            className="input"
            rows={12}
            spellCheck={false}
            readOnly={!editing}
            maxLength={TEMPLATE_TEXT_MAX}
            value={text}
            aria-label={editing ? 'Текст своего шаблона' : 'Текст встроенного шаблона (только чтение)'}
            style={{ fontFamily: 'var(--mono, monospace)', fontSize: '0.82rem' }}
            onChange={(e) => editing && setDraft({ ...editing, text: e.target.value })}
            onBlur={() => commitDraft()}
          />
          {editing ? (
            <div className="row wrap gap6 small muted">
              {PROMPT_VARS.map((v) => (
                <button key={v.name} type="button" className="chip-btn neutral" title={v.hint} onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v.name)}>
                  {`{{${v.name}}}`}
                </button>
              ))}
              <span>— нажми, чтобы вставить</span>
            </div>
          ) : (
            <span className="small muted">
              Встроенный шаблон менять нельзя.{' '}
              <button type="button" className="link-btn small" onClick={() => createMine(text, `${TASK_TITLES[task]} (${familyTitle(resolved.family)})`)}>
                Сделать свой на его основе
              </button>
            </span>
          )}
          {editing && <span className="small muted">В приложении «Свои указания» дописываются в конец промта сами, после формата ответа, поэтому {'{{указания}}'} здесь остаётся пустым — указания не повторятся дважды.</span>}

          <details className="small">
            <summary>
              🔒 <b>Формат ответа добавляется сам</b> — метки рисунков, [[ПУСТО]], правила чтения фото
            </summary>
            <p className="muted">Их не нужно писать и нельзя убрать, поэтому любой свой шаблон не мешает Refrain разобрать ответ. В конец промта добавляется:</p>
            <pre className="muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
              {formatLock(task)}
            </pre>
          </details>

          <div className="row wrap gap8">
            <button
              type="button"
              className="btn primary small"
              disabled={!api?.aiAsk || !canTryOnSample(task) || trial.state === 'busy'}
              title={canTryOnSample(task) ? 'Шаблон проверяется на встроенном примере страницы' : 'Для этой задачи нужно настоящее фото'}
              onClick={() => {
                commitDraft();
                void tryOnSample();
              }}
            >
              {trial.state === 'busy' ? 'Проверяю…' : 'Проверить на странице'}
            </button>
            {resolved.pick !== 'auto' && (
              <button type="button" className="btn small" onClick={() => setPick(task, 'auto')}>
                Сбросить
              </button>
            )}
            <button type="button" className="btn small" onClick={exportCurrent}>
              Экспорт {PROMPT_EXT}
            </button>
            {own && (
              <ConfirmButton
                className="btn ghost danger small"
                onConfirm={() => {
                  setDraft(null);
                  const p = { ...(settings?.pick ?? {}) };
                  for (const [k, v] of Object.entries(p)) if (v === `my:${own.id}`) delete p[k];
                  save({ pick: p, mine: mine.filter((m) => m.id !== own.id) });
                }}
              >
                Удалить шаблон
              </ConfirmButton>
            )}
            <span className="small muted">≈ {tokens} токенов в каждом запросе</span>
          </div>

          {trial.state !== 'idle' && (
            <div className="card stack gap8" style={{ padding: 12 }} aria-live="polite">
              <span className="small muted">Проверка на примере: {SAMPLE_PAGE.subject}, «{SAMPLE_PAGE.topic}», стр. {SAMPLE_PAGE.page}</span>
              {trial.state === 'busy' && <span className="small">ИИ отвечает…</span>}
              {trial.state === 'error' && <span className="small">Не получилось: {trial.text}</span>}
              {trial.state === 'done' && (
                <>
                  <Markdown text={trial.md} className="note-doc" />
                  {trial.note && <span className="small muted">{trial.note}</span>}
                </>
              )}
            </div>
          )}
          {!canTryOnSample(task) && <span className="small muted">Шаблон «{TASK_TITLES[task]}» проверяется на настоящем фото: в примере нет почерка и рукописных формул.</span>}
          <span className="small muted">Пример страницы встроен в приложение; при проверке он уходит только выбранному ИИ.</span>
        </div>
      </div>
    </div>
  );
}
