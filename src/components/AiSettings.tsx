import { useEffect, useState } from 'react';
import { humanError, testConnection } from '../ai';
import type { AiAuth, AiConfig, AiFormat, AiModelInfo, AiProvider, CustomAi, CustomAiDraft } from '../store';
import { Icon, Modal, Segmented, Switch, Collapse } from './ui';

type ConfigPatch = Partial<Omit<AiConfig, 'hasKey' | 'custom'>> & { key?: { provider: 'anthropic' | 'gemini'; value: string } };
type Status = { kind: 'ok' | 'warn' | 'info'; text: string } | null;

const LINKS: Record<'anthropic' | 'gemini', { name: string; url: string }> = {
  anthropic: { name: 'console.anthropic.com', url: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'aistudio.google.com', url: 'https://aistudio.google.com/apikey' }
};

/** Готовые шаблоны — подставляют адрес и формат. Модель выбирается кнопкой «Найти модели». */
export const AI_PRESETS: { name: string; format: AiFormat; baseUrl: string; auth: AiAuth; vision: boolean; note?: string }[] = [
  { name: 'OpenAI (ChatGPT)', format: 'openai', baseUrl: 'https://api.openai.com/v1', auth: 'bearer', vision: true },
  { name: 'OpenRouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', auth: 'bearer', vision: true, note: 'Сотни моделей по одному ключу, есть бесплатные (с «:free»). Бесплатные бывают перегружены — тогда Мнема сама возьмёт другую бесплатную. «openrouter/free» — любая свободная бесплатная модель.' },
  { name: 'DeepSeek', format: 'openai', baseUrl: 'https://api.deepseek.com/v1', auth: 'bearer', vision: false, note: 'Картинки не понимает — для фото выбери другой ИИ.' },
  { name: 'Mistral', format: 'openai', baseUrl: 'https://api.mistral.ai/v1', auth: 'bearer', vision: true },
  { name: 'Groq', format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', auth: 'bearer', vision: false },
  { name: 'xAI (Grok)', format: 'openai', baseUrl: 'https://api.x.ai/v1', auth: 'bearer', vision: true },
  { name: 'Together AI', format: 'openai', baseUrl: 'https://api.together.xyz/v1', auth: 'bearer', vision: false },
  { name: 'Ollama (на компьютере)', format: 'openai', baseUrl: 'http://localhost:11434/v1', auth: 'none', vision: true, note: 'Бесплатно и без интернета. Запусти Ollama и скачай модель.' },
  { name: 'Другой — OpenAI-совместимый', format: 'openai', baseUrl: 'https://', auth: 'bearer', vision: true, note: 'Подходит большинству сервисов: у них в документации написано «OpenAI-compatible».' },
  { name: 'Другой — формат Anthropic', format: 'anthropic', baseUrl: 'https://', auth: 'x-api-key', vision: true },
  { name: 'Другой — формат Gemini', format: 'gemini', baseUrl: 'https://', auth: 'bearer', vision: true }
];

const FORMAT_LABEL: Record<AiFormat, string> = { openai: 'OpenAI-совместимый', anthropic: 'Anthropic', gemini: 'Gemini' };

export function AiSettings() {
  const api = window.mnemaApi;
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CustomAi | 'new' | null>(null);

  useEffect(() => {
    void api?.aiGetConfig?.().then(setCfg);
  }, [api]);

  if (!api?.aiGetConfig) return <p className="small muted">ИИ-помощник работает в приложении для Windows.</p>;
  if (!cfg) return null;
  const p = cfg.provider;
  const custom = p.startsWith('custom:') ? cfg.custom.find((x) => 'custom:' + x.id === p) : undefined;

  async function save(patch: ConfigPatch) {
    const next = await api!.aiSetConfig!(patch);
    setCfg(next);
    return next;
  }

  async function check() {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Проверяю…' });
    try {
      const t = await testConnection();
      setStatus({ kind: 'ok', text: `Работает. Модель ответила: «${t.slice(0, 40)}»` });
    } catch (e) {
      setStatus({ kind: 'warn', text: humanError((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function findLocal() {
    const r = await api!.aiLocalModels!();
    if (r.ok) {
      setLocalModels(r.models);
      if (r.models.length === 0) setStatus({ kind: 'warn', text: 'Сервер работает, но модели не загружены. Загрузи модель в LM Studio.' });
      else setStatus(null);
    } else setStatus({ kind: 'warn', text: humanError(r.error) });
  }

  const providers: { id: AiProvider; name: string; sub: string; vision: boolean; custom?: CustomAi }[] = [
    { id: 'anthropic', name: 'Claude', sub: 'Anthropic · нужен ключ', vision: true },
    { id: 'gemini', name: 'Gemini', sub: 'Google · нужен ключ', vision: true },
    { id: 'local', name: 'На компьютере', sub: 'LM Studio · без интернета', vision: true },
    ...cfg.custom.map((c) => ({ id: `custom:${c.id}` as AiProvider, name: c.name, sub: `${FORMAT_LABEL[c.format]} · ${c.model || 'модель не выбрана'}`, vision: c.vision, custom: c }))
  ];
  const current = providers.find((x) => x.id === p);
  const visionChoices = providers.filter((x) => x.vision && x.id !== p);

  return (
    <div className="stack gap12">
      <div className="ai-list" role="radiogroup" aria-label="Какой ИИ">
        {providers.map((x) => (
          <div key={x.id} className={'ai-item' + (x.id === p ? ' on' : '')}>
            <button
              role="radio"
              aria-checked={x.id === p}
              className="ai-pick"
              onClick={() => {
                setStatus(null);
                setKey('');
                void save({ provider: x.id });
              }}
            >
              <span className="ai-radio" />
              <span className="grow stack">
                <strong>{x.name}</strong>
                <span className="small muted">
                  {x.sub}
                  {!x.vision && ' · без картинок'}
                </span>
              </span>
            </button>
            {x.custom && (
              <button className="icon-btn small" aria-label={`Изменить ${x.name}`} title="Изменить" onClick={() => setEditing(x.custom!)}>
                <Icon name="edit" size={16} />
              </button>
            )}
          </div>
        ))}
        <button className="ai-add" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> Добавить свой ИИ — любой сервис по API
        </button>
      </div>

      {(p === 'anthropic' || p === 'gemini') && (
        <div className="stack gap8">
          <span className="small muted">
            Нужен ключ API — его можно получить на{' '}
            <a href={LINKS[p].url} target="_blank" rel="noreferrer">
              {LINKS[p].name}
            </a>
            . Использование платное или ограничено бесплатным лимитом сервиса.
          </span>
          {cfg.hasKey[p] ? (
            <div className="row gap8">
              <span className="grow small">Ключ сохранён и зашифрован на этом устройстве ✓</span>
              <button className="btn small ghost danger" onClick={() => void save({ key: { provider: p, value: '' } })}>
                Удалить ключ
              </button>
            </div>
          ) : (
            <form
              className="row gap8"
              onSubmit={(e) => {
                e.preventDefault();
                if (!key.trim()) return;
                void save({ key: { provider: p, value: key } }).then(() => {
                  setKey('');
                  void check();
                });
              }}
            >
              <input className="input grow" type="password" autoComplete="off" placeholder="Вставь ключ API" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Ключ API" />
              <button className="btn primary" type="submit" disabled={!key.trim()}>
                Сохранить
              </button>
            </form>
          )}
        </div>
      )}
      {p === 'local' && (
        <div className="stack gap8">
          <span className="small muted">
            Модель работает прямо на твоём компьютере через LM Studio: без ключа и интернета. В LM Studio загрузи модель (для рукописных формул и фото нужна модель, которая понимает картинки) и включи сервер.
          </span>
          <label className="row gap8">
            <span className="small muted nowrap">Адрес сервера</span>
            <input className="input grow" value={cfg.endpoint} onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })} onBlur={(e) => void save({ endpoint: e.target.value })} />
            <button className="btn small" onClick={() => void findLocal()}>
              Найти модели
            </button>
          </label>
        </div>
      )}
      {!custom && (
        <label className="row gap8">
          <span className="small muted nowrap">Модель</span>
          {p === 'local' && localModels.length > 0 ? (
            <select className="input grow" value={cfg.models.local} onChange={(e) => void save({ models: { ...cfg.models, local: e.target.value } })}>
              <option value="">— выбери —</option>
              {localModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input grow mono"
              value={cfg.models[p as 'anthropic' | 'gemini' | 'local']}
              placeholder={p === 'local' ? 'название модели в LM Studio' : ''}
              onChange={(e) => setCfg({ ...cfg, models: { ...cfg.models, [p]: e.target.value } })}
              onBlur={(e) => void save({ models: { ...cfg.models, [p]: e.target.value } })}
            />
          )}
          <button className="btn small" disabled={busy || ((p === 'anthropic' || p === 'gemini') && !cfg.hasKey[p])} onClick={() => void check()}>
            Проверить
          </button>
        </label>
      )}
      {custom && (
        <div className="row gap8">
          <span className="grow small muted">
            {custom.baseUrl} · {custom.hasKey ? 'ключ сохранён ✓' : custom.auth === 'none' ? 'без ключа' : 'ключ не указан'}
          </span>
          <button className="btn small" disabled={busy} onClick={() => void check()}>
            Проверить
          </button>
        </div>
      )}
      {current && !current.vision && (
        <label className="row gap8 small">
          <span className="grow">«{current.name}» не понимает картинки. Для фото учебника и формул от руки использовать:</span>
          <select className="input" value={cfg.visionProvider} onChange={(e) => void save({ visionProvider: e.target.value as AiProvider | '' })} aria-label="ИИ для картинок">
            <option value="">— не выбран —</option>
            {visionChoices.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {api.aiTranscribe && api.platform !== 'android' && (
        <label className="row gap8 small">
          <span className="grow">Для ответа голосом (распознать речь) использовать:</span>
          <select className="input" value={cfg.speechProvider} onChange={(e) => void save({ speechProvider: e.target.value as AiProvider | '' })} aria-label="ИИ для речи">
            <option value="">{current && !/Claude|Anthropic/.test(current.sub + current.name) ? 'тот же' : '— выбери —'}</option>
            {providers
              .filter((x) => x.id !== 'anthropic' && x.custom?.format !== 'anthropic')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {status && <div className={'hint ' + (status.kind === 'ok' ? 'ok' : status.kind === 'warn' ? 'warn' : '')}>{status.text}</div>}
      <p className="small muted">
        ИИ получает текст карточки, рисунок, фото страницы или запись голоса только когда ты сам нажимаешь кнопку («Объясни иначе», «Распознать», «Из учебника», «Ответить голосом»). Ответы ИИ могут ошибаться — сверяй с учебником.
      </p>

      {editing && (
        <CustomAiEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setCfg(c);
            setEditing(null);
            setStatus({ kind: 'ok', text: 'Сохранено. Этот ИИ теперь выбран.' });
          }}
          onDeleted={(c) => {
            setCfg(c);
            setEditing(null);
            setStatus(null);
          }}
        />
      )}
    </div>
  );
}

function CustomAiEditor({ initial, onClose, onSaved, onDeleted }: { initial: CustomAi | null; onClose: () => void; onSaved: (c: AiConfig) => void; onDeleted: (c: AiConfig) => void }) {
  const api = window.mnemaApi!;
  const [preset, setPreset] = useState(initial ? -1 : 0);
  const [d, setD] = useState<CustomAiDraft>(() =>
    initial
      ? { id: initial.id, name: initial.name, format: initial.format, baseUrl: initial.baseUrl, model: initial.model, vision: initial.vision, auth: initial.auth, headers: initial.headers, speechModel: initial.speechModel ?? '' }
      : { name: AI_PRESETS[0].name, format: AI_PRESETS[0].format, baseUrl: AI_PRESETS[0].baseUrl, model: '', vision: AI_PRESETS[0].vision, auth: AI_PRESETS[0].auth, headers: '' }
  );
  const [key, setKey] = useState('');
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(initial?.headers) || (initial ? initial.auth !== 'bearer' && initial.auth !== 'none' : false));
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<CustomAiDraft>) => setD((x) => ({ ...x, ...p }));
  const draft = (): CustomAiDraft => ({ ...d, key: key.trim() ? key : undefined });
  const insecure = /^http:\/\//i.test(d.baseUrl) && !/^http:\/\/(localhost|127\.|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(d.baseUrl);
  const presetNote = preset >= 0 ? AI_PRESETS[preset].note : undefined;

  async function findModels() {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Спрашиваю у сервиса список моделей…' });
    const r = await api.aiProbe!({ draft: draft(), kind: 'models' });
    setBusy(false);
    if (r.ok) {
      setModels(r.models ?? []);
      const n = r.models?.length ?? 0;
      const free = r.models?.filter((m) => m.free).length ?? 0;
      setStatus(n ? { kind: 'info', text: `Найдено моделей: ${n}${free ? `, бесплатных: ${free}` : ''}. Начни печатать название, чтобы найти нужную.` } : { kind: 'warn', text: 'Сервис не вернул список моделей — впиши название модели вручную (оно есть в документации сервиса).' });
    } else setStatus({ kind: 'warn', text: humanError(r.error) });
  }

  async function test() {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Проверяю: отправляю короткий вопрос и крошечную картинку…' });
    const r = await api.aiProbe!({ draft: draft(), kind: 'test', checkVision: true });
    setBusy(false);
    if (r.ok) {
      if (r.vision !== undefined && r.vision !== d.vision) set({ vision: r.vision });
      setStatus({ kind: 'ok', text: `${r.keyInfo ? r.keyInfo + ' ' : ''}Работает. Ответ: «${(r.text ?? '').slice(0, 40)}». ${r.vision ? 'Картинки понимает ✓' : 'Картинки не понимает — для фото и формул от руки выберешь другой ИИ.'}` });
    } else setStatus({ kind: 'warn', text: humanError(r.error) });
  }

  async function save() {
    setBusy(true);
    const r = await api.aiSaveCustom!({ ...draft(), select: true });
    setBusy(false);
    if (r.ok) onSaved(r.config);
    else setStatus({ kind: 'warn', text: r.error });
  }

  return (
    <Modal title={initial ? `ИИ: ${initial.name}` : 'Добавить свой ИИ'} onClose={onClose} width={640} sticky={busy}>
      <div className="stack gap12">
        {!initial && (
          <label className="field">
            <span>Сервис</span>
            <select
              className="input"
              value={preset}
              onChange={(e) => {
                const i = Number(e.target.value);
                setPreset(i);
                const pr = AI_PRESETS[i];
                setModels([]);
                setStatus(null);
                set({ name: pr.name.startsWith('Другой') ? 'Мой ИИ' : pr.name, format: pr.format, baseUrl: pr.baseUrl, auth: pr.auth, vision: pr.vision, model: '' });
              }}
            >
              {AI_PRESETS.map((pr, i) => (
                <option key={pr.name} value={i}>
                  {pr.name}
                </option>
              ))}
            </select>
            {presetNote && <span className="small muted">{presetNote}</span>}
          </label>
        )}
        <label className="field">
          <span>Название (как будет в списке)</span>
          <input className="input" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="field">
          <span>Формат API</span>
          <Segmented
            ariaLabel="Формат API"
            value={d.format}
            onChange={(v) => set({ format: v, auth: v === 'anthropic' ? 'x-api-key' : d.auth === 'x-api-key' ? 'bearer' : d.auth })}
            options={[
              { value: 'openai', label: 'OpenAI-совместимый' },
              { value: 'anthropic', label: 'Anthropic' },
              { value: 'gemini', label: 'Gemini' }
            ]}
          />
        </div>
        <label className="field">
          <span>Адрес API</span>
          <input className="input mono" value={d.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
          <span className="small muted">
            {d.format === 'openai' ? 'Обычно заканчивается на /v1 — Мнема добавит /chat/completions сама.' : d.format === 'anthropic' ? 'Без /v1/messages — например https://api.anthropic.com' : 'Без /v1beta — например https://generativelanguage.googleapis.com'}
          </span>
          {insecure && <span className="small warn-text">Адрес без https: ключ пойдёт по сети незашифрованным. Так можно только для своего компьютера или домашней сети.</span>}
        </label>
        <label className="field">
          <span>Ключ API {initial?.hasKey && <span className="muted">(сохранён — впиши новый, чтобы заменить; если поменяешь адрес, ключ нужно ввести заново)</span>}</span>
          <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={d.auth === 'none' ? 'не нужен' : 'вставь ключ'} disabled={d.auth === 'none'} />
        </label>
        <div className="field">
          <span>Модель</span>
          <div className="row gap8">
            <ModelPicker
              models={models}
              value={d.model}
              onChange={(id) => {
                const m = models.find((x) => x.id === id);
                set({ model: id, ...(m && m.vision !== undefined ? { vision: m.vision } : {}) });
              }}
            />
            <button className="btn small" disabled={busy || !/^https?:\/\/.+/.test(d.baseUrl)} onClick={() => void findModels()}>
              Найти модели
            </button>
          </div>
        </div>
        <div className="row gap8">
          <span className="grow small">Понимает картинки (фото учебника, формулы от руки)</span>
          <Switch label="Понимает картинки" checked={d.vision} onChange={(v) => set({ vision: v })} />
        </div>
        <button className="disclosure small-disc" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          <span className="grow">Для продвинутых</span>
          <span className={'chev' + (advanced ? ' open' : '')}>›</span>
        </button>
        <Collapse open={advanced}>
          <div className="stack gap8">
            <label className="field">
              <span>Как передавать ключ</span>
              <select className="input" value={d.auth} onChange={(e) => set({ auth: e.target.value as AiAuth })}>
                <option value="bearer">Authorization: Bearer …</option>
                <option value="api-key">Authorization: Api-Key …</option>
                <option value="x-api-key">x-api-key: …</option>
                <option value="none">Без ключа</option>
              </select>
            </label>
            {d.format === 'openai' && (
              <label className="field">
                <span>Модель для распознавания речи (ответ голосом)</span>
                <input className="input mono" value={d.speechModel ?? ''} onChange={(e) => set({ speechModel: e.target.value })} placeholder={/groq\.com/.test(d.baseUrl) ? 'whisper-large-v3' : 'whisper-1'} />
              </label>
            )}
            <label className="field">
              <span>Дополнительные заголовки — по одному в строке, «Имя: значение»</span>
              <textarea className="mono" rows={2} value={d.headers} onChange={(e) => set({ headers: e.target.value })} placeholder="x-folder-id: b1g…" />
            </label>
          </div>
        </Collapse>
        {status && <div className={'hint ' + (status.kind === 'ok' ? 'ok' : status.kind === 'warn' ? 'warn' : '')}>{status.text}</div>}
        <div className="row gap8">
          {initial &&
            (confirmDel ? (
              <button
                className="btn danger-solid small"
                onClick={async () => {
                  onDeleted(await api.aiDeleteCustom!(initial.id));
                }}
              >
                Точно удалить
              </button>
            ) : (
              <button className="btn ghost danger small" onClick={() => setConfirmDel(true)}>
                Удалить
              </button>
            ))}
          <span className="grow" />
          <button className="btn" disabled={busy || !/^https?:\/\/.+\..+|^https?:\/\/localhost/.test(d.baseUrl)} onClick={() => void test()}>
            Проверить
          </button>
          <button className="btn primary" disabled={busy || !d.baseUrl.trim() || ((d.format !== 'openai' || /openrouter\.ai/i.test(d.baseUrl)) && !d.model.trim())} onClick={() => void save()}>
            Сохранить и выбрать
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Выбор модели из длинного списка: поиск по названию, пометки «бесплатно» и «картинки». */
function ModelPicker({ models, value, onChange }: { models: AiModelInfo[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const q = value.trim().toLowerCase();
  const exact = models.some((m) => m.id === value);
  const list = models.filter((m) => (!onlyFree || m.free) && (!q || exact || m.id.toLowerCase().includes(q))).slice(0, 300);
  return (
    <div className="model-picker grow">
      <input
        className="input mono"
        value={value}
        placeholder={models.length ? 'начни печатать, например: deepseek, gemini, free' : 'название модели'}
        aria-label="Модель"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange(e.target.value.trim());
          setOpen(true);
        }}
      />
      {open && models.length > 0 && (
        <div className="model-list" role="listbox">
          {models.some((m) => m.free) && (
            <label className="model-free" onMouseDown={(e) => e.preventDefault()}>
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> только бесплатные
            </label>
          )}
          {list.map((m) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === value}
              className={'model-opt' + (m.id === value ? ' on' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <span className="grow mono">{m.id}</span>
              {m.free && <span className="tag free">бесплатно</span>}
              {m.vision && <span className="tag">картинки</span>}
            </button>
          ))}
          {list.length === 0 && <span className="small muted model-empty">Ничего не нашлось — можно вписать название вручную.</span>}
        </div>
      )}
    </div>
  );
}
