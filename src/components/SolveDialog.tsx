// «Решить по шагам» (1.32, N3): фото условия (камера или галерея) и/или текст → пошаговое решение от ИИ с формулами.
// Решение можно положить в конспект темы или сделать из него карточку (условие → ответ, шаги — в «почему»).
import { useRef, useState } from 'react';
import { aiAvailable } from '../ai';
import { solutionCard, solveProblem, SOLVE_TEXT_MAX } from '../solve';
import { addCard, getData, sortedSubjects, updateTopic, useData } from '../store';
import { CameraCapture } from './CameraCapture';
import { Markdown } from './Markdown';
import { Icon, Modal, Skeleton, toast, touchUI } from './ui';

type Step = { name: 'input' } | { name: 'busy' } | { name: 'done'; md: string };

const readUrl = (f: Blob) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(r.error ?? new Error('Не получилось прочитать фото.'));
    r.readAsDataURL(f);
  });

/** onNoteSaved — решение дописано в конспект: открытый редактор должен перечитать текст. */
export function SolveDialog({ onClose, topicId, subjectId, initial, onNoteSaved }: { onClose: () => void; topicId?: string; subjectId?: string; initial?: { text?: string; photo?: string }; onNoteSaved?: () => void }) {
  const data = useData();
  const topic = topicId ? data.topics.find((t) => t.id === topicId) : undefined;
  const [subject, setSubject] = useState(topic?.subjectId ?? subjectId ?? '');
  const [photo, setPhoto] = useState(initial?.photo ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [camera, setCamera] = useState(false);
  const [step, setStep] = useState<Step>({ name: 'input' });
  const [error, setError] = useState('');
  const [cardTopic, setCardTopic] = useState(topic?.id ?? data.topics.find((t) => t.subjectId === subject && !t.kind)?.id ?? '');
  const [saved, setSaved] = useState<{ note?: boolean; card?: boolean }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const canAi = aiAvailable(data);
  const subj = data.subjects.find((s) => s.id === subject);

  async function takeFile(f: File) {
    setError('');
    if (!/^image\//.test(f.type)) return setError('Нужна картинка: фото или скриншот условия.');
    if (f.size > 25 * 1024 * 1024) return setError('Фото слишком большое. Сфотографируй с меньшим разрешением.');
    try {
      setPhoto(await readUrl(f));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run() {
    setError('');
    setSaved({});
    setStep({ name: 'busy' });
    try {
      const m = /^data:([^;]+);base64,(.*)$/.exec(photo);
      const md = await solveProblem({ text, image: m ? { mime: m[1], data: m[2] } : undefined, subject: subj?.name, topic: topic?.name });
      setStep({ name: 'done', md });
    } catch (e) {
      setError((e as Error).message || 'Не получилось.');
      setStep({ name: 'input' });
    }
  }

  function toNote(md: string) {
    if (!topic) return;
    const t = getData().topics.find((x) => x.id === topic.id);
    if (!t) return;
    updateTopic(t.id, { note: `${t.note.trimEnd()}\n\n### Задача\n\n${md.replace(/^### /gm, '#### ')}\n` });
    setSaved((s) => ({ ...s, note: true }));
    onNoteSaved?.();
    toast('Решение — в конспекте темы');
  }

  function toCard(md: string) {
    if (!cardTopic) return;
    const c = solutionCard(md, text.trim());
    addCard({ topicId: cardTopic, type: 'basic', front: c.front, back: c.back, why: c.why });
    setSaved((s) => ({ ...s, card: true }));
    toast('Карточка добавлена: условие → ответ, шаги — в «Почему»');
  }

  return (
    <Modal title="Решить по шагам" onClose={onClose} width={720} sticky={step.name === 'busy'}>
      <div className="stack gap12">
        {!canAi && <div className="hint warn">Сначала подключи ИИ: войди в Refrain ИИ или добавь свой ключ (Настройки → ИИ).</div>}
        {error && (
          <div className="hint warn" role="alert">
            {error}
          </div>
        )}

        {step.name === 'input' && (
          <>
            {photo ? (
              <div className="solve-photo">
                <img src={photo} alt="Фото условия" />
                <button type="button" className="btn small ghost" onClick={() => setPhoto('')}>
                  <Icon name="x" size={16} /> Убрать фото
                </button>
              </div>
            ) : (
              <div className="row gap8 wrap">
                {touchUI() && typeof navigator.mediaDevices?.getUserMedia === 'function' && (
                  <button type="button" className="btn primary" onClick={() => setCamera(true)}>
                    <Icon name="camera" size={18} /> Сфотографировать
                  </button>
                )}
                <button type="button" className={'btn' + (touchUI() ? '' : ' primary')} onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={18} /> Выбрать фото
                </button>
              </div>
            )}
            <label className="imp-opt">
              <span className="small muted">{photo ? 'Что решить (например, «№ 3, пункт б») — по желанию' : 'Или напиши условие'}</span>
              <textarea className="input" rows={photo ? 2 : 4} maxLength={SOLVE_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={photo ? '№ 3' : 'Автомобиль проехал 120 км за 1,5 ч. Найди его скорость.'} />
            </label>
            {!topic && data.subjects.length > 0 && (
              <label className="imp-opt">
                <span className="small muted">Предмет (поможет ИИ)</span>
                <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">Не важно</option>
                  {sortedSubjects(data).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="small muted">ИИ получит только фото и текст условия. Решение — подсказка: разбери каждый шаг и реши похожую сам.</p>
            <div className="row end gap8">
              <button className="btn ghost" onClick={onClose}>
                Отмена
              </button>
              <button className="btn primary" disabled={!canAi || (!photo && text.trim().length < 5)} onClick={() => void run()}>
                <Icon name="sparkle" size={16} /> Решить
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void takeFile(f);
              }}
            />
          </>
        )}

        {step.name === 'busy' && (
          <div className="stack gap8">
            <p className="row gap8">
              <Icon name="sparkle" size={18} /> Решаю по шагам…
            </p>
            <Skeleton lines={6} label="ИИ решает задачу" />
          </div>
        )}

        {step.name === 'done' && (
          <>
            <div className="solve-result">
              <Markdown text={step.md} />
            </div>
            <p className="small muted">ИИ может ошибиться в вычислениях — проверь каждый шаг.</p>
            {!topic && data.topics.length > 0 && (
              <label className="imp-opt">
                <span className="small muted">Карточку — в тему</span>
                <select className="input" value={cardTopic} onChange={(e) => setCardTopic(e.target.value)}>
                  {sortedSubjects(data).map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {data.topics
                        .filter((t) => t.subjectId === s.id && !t.kind)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <div className="row end gap8 wrap">
              <button className="btn ghost" onClick={() => (setStep({ name: 'input' }), setPhoto(''), setText(''))}>
                Другая задача
              </button>
              {topic && (
                <button className="btn" disabled={saved.note} onClick={() => toNote(step.md)}>
                  <Icon name="book" size={16} /> {saved.note ? 'В конспекте ✓' : 'В конспект'}
                </button>
              )}
              {cardTopic && (
                <button className="btn primary" disabled={saved.card} onClick={() => toCard(step.md)}>
                  <Icon name="cardPlus" size={16} /> {saved.card ? 'Карточка есть ✓' : 'Сделать карточку'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {camera && (
        <CameraCapture
          onShot={(f) => {
            setCamera(false);
            void takeFile(f);
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </Modal>
  );
}
