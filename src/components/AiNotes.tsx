// «Свои указания» для ИИ и выбор ИИ для задач — внизу настроек ИИ.
import { useEffect, useRef, useState } from 'react';
import { AI_NOTE_EXAMPLES, AI_NOTE_KEYS, AI_NOTE_MAX, AI_NOTE_TITLES, AI_TASKS, cleanNote } from '../aiTasks';
import { updateSettings, useData, type AiConfig } from '../store';
import type { AiNoteKey, AiTask } from '../types';
import { Icon } from './ui';

const TASK_TITLE: Record<AiTask, string> = { textbook: 'Страницы учебника', cards: 'Черновики карточек', explain: 'Объяснения («Объясни иначе»)', style: 'Стили оформления' };

/** Одно поле указаний: пишем в черновик, в настройки кладём, когда ученик закончил (ушёл из поля или закрыл настройки). */
function NoteField({ k }: { k: AiNoteKey }) {
  const data = useData();
  const saved = data.settings.aiNotes?.[k] ?? '';
  const [text, setText] = useState(saved);
  const ref = useRef(text);
  ref.current = text;
  const put = (v: string) => {
    const t = cleanNote(v);
    const all = { ...(data.settings.aiNotes ?? {}) };
    if (t) all[k] = t;
    else delete all[k];
    if ((all[k] ?? '') !== saved) updateSettings({ aiNotes: Object.keys(all).length ? all : undefined });
  };
  // Закрыли настройки, не уходя из поля, — всё равно сохранить.
  const putRef = useRef(put);
  putRef.current = put;
  useEffect(() => () => putRef.current(ref.current), []);
  const info = AI_NOTE_TITLES[k];
  return (
    <div className="stack gap6">
      <label className="stack gap4">
        <strong className="small">{info.title}</strong>
        <textarea
          className="input"
          rows={2}
          maxLength={AI_NOTE_MAX}
          placeholder={info.hint}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            put(text);
            setText(cleanNote(text));
          }}
          aria-label={`Указания ИИ: ${info.title}`}
        />
      </label>
      <div className="row gap6 wrap">
        {AI_NOTE_EXAMPLES[k].map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip-btn"
            title="Добавить в указания"
            onClick={() => {
              const next = cleanNote(text ? (text.endsWith('.') ? text + ' ' + ex : text + '. ' + ex) : ex);
              setText(next);
              put(next);
            }}
          >
            + {ex}
          </button>
        ))}
        <span className="small muted grow" style={{ textAlign: "right" }}>
          {text.length}/{AI_NOTE_MAX}
        </span>
      </div>
    </div>
  );
}

/** ИИ, которые можно выбрать для задач: основной всегда, остальные — если настроены (есть ключ или он не нужен). */
function readyProviders(cfg: AiConfig): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  if (cfg.hasKey.anthropic) out.push({ id: 'anthropic', name: 'Claude' });
  if (cfg.hasKey.gemini) out.push({ id: 'gemini', name: 'Gemini' });
  out.push({ id: 'local', name: 'На компьютере' });
  for (const c of cfg.custom) if (c.hasKey || c.auth === 'none') out.push({ id: 'custom:' + c.id, name: c.name });
  return out;
}

export function AiNotes({ cfg }: { cfg: AiConfig }) {
  const data = useData();
  const [more, setMore] = useState(() => AI_NOTE_KEYS.some((k) => k !== 'all' && data.settings.aiNotes?.[k]));
  const choices = readyProviders(cfg).filter((x) => x.id !== cfg.provider);
  const chosen = data.settings.aiTaskProvider ?? {};
  const setTask = (t: AiTask, id: string) => {
    const next = { ...chosen };
    if (id) next[t] = id;
    else delete next[t];
    updateSettings({ aiTaskProvider: Object.keys(next).length ? next : undefined });
  };
  return (
    <div className="stack gap12 ai-notes">
      <div className="stack gap4">
        <h3>Свои указания</h3>
        <span className="small muted">Мнема допишет их к запросам ИИ: он будет объяснять так, как удобно тебе. Они не меняют правила и формат ответов, поэтому ничего не сломают. Указания лежат только у тебя и в чужие файлы не попадают.</span>
      </div>
      <NoteField k="all" />
      <button type="button" className="link-btn small row gap4" aria-expanded={more} onClick={() => setMore(!more)}>
        <Icon name="chevron" size={14} /> {more ? 'Скрыть указания для отдельных задач' : 'Указания для отдельных задач'}
      </button>
      {more && (
        <div className="stack gap12">
          {AI_NOTE_KEYS.filter((k) => k !== 'all').map((k) => (
            <NoteField key={k} k={k} />
          ))}
        </div>
      )}
      {(choices.length > 0 || Object.keys(chosen).length > 0) && (
        <div className="stack gap8">
          <div className="stack gap4">
            <h3>Какой ИИ для чего</h3>
            <span className="small muted">По умолчанию всё делает основной ИИ. Для задачи можно взять другой из настроенных — например, посильнее для учебника. Нет ключа или ИИ удалён — возьмётся основной.</span>
          </div>
          {AI_TASKS.map((t) => (
            <label key={t} className="row gap8 small">
              <span className="grow">{TASK_TITLE[t]}</span>
              <select className="input" value={chosen[t] ?? ''} onChange={(e) => setTask(t, e.target.value)} aria-label={`ИИ для задачи: ${TASK_TITLE[t]}`}>
                <option value="">как основной</option>
                {[...choices, ...(chosen[t] && !choices.some((c) => c.id === chosen[t]) ? [{ id: chosen[t]!, name: 'выбранный раньше' }] : [])].map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
