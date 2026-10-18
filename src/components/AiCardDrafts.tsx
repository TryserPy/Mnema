// Черновики карточек от ИИ по конспекту темы: ИИ только предлагает, ученик читает, правит своими словами и выбирает.
// Ничего не добавляется само: карточки появятся только после нажатия «Добавить».
import { useEffect, useRef, useState } from 'react';
import { draftCards } from '../ai';
import type { AiCardDraft } from '../aiCards';
import { addCard, useData } from '../store';
import { Icon, Modal, Skeleton, plural, toast } from './ui';
import { AiProblem, AiWorking, failureOf } from './AiRun';
import type { AiFailure } from '../aiFailure';

/** Сколько черновиков отмечено сразу: 40 новых карточек за раз — долг на недели, лучше начать с малого. */
const PRESET = 10;

type Phase = { name: 'loading' } | { name: 'error'; text: string; failure: AiFailure } | { name: 'done' };

export function AiCardDrafts({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const data = useData();
  const topic = data.topics.find((t) => t.id === topicId);
  const subject = topic ? data.subjects.find((s) => s.id === topic.subjectId) : undefined;
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });
  const [drafts, setDrafts] = useState<(AiCardDraft & { on: boolean })[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run() {
    if (!topic) return;
    setPhase({ name: 'loading' });
    try {
      const have = data.cards.filter((c) => c.topicId === topicId).map((c) => c.front);
      const list = await draftCards({ subject: subject?.name, topic: topic.name, note: topic.note, have });
      if (!alive.current) return;
      setDrafts(list.map((d, i) => ({ ...d, on: i < PRESET })));
      setPhase({ name: 'done' });
    } catch (e) {
      if (alive.current) setPhase({ name: 'error', text: (e as Error).message || 'Не получилось.', failure: failureOf(e) });
    }
  }
  useEffect(() => {
    void run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = drafts.filter((d) => d.on && d.front.trim() && d.back.trim());
  const patch = (i: number, p: Partial<AiCardDraft & { on: boolean }>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...p } : d)));

  return (
    <Modal title="Черновики карточек от ИИ" onClose={onClose} width={760} sticky>
      <div className="stack gap12">
        {phase.name === 'loading' && (
          <div className="stack gap8">
            <AiWorking label="ИИ читает конспект и придумывает вопросы…" onCancel={onClose} />
            <p className="small muted">Текст конспекта (без картинок) отправлен ИИ-помощнику, которого ты настроил. Карточки он только предложит — добавишь ты сам.</p>
            <div className="bulk-list" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bulk-row">
                  <Skeleton lines={2} label="" />
                </div>
              ))}
            </div>
          </div>
        )}
        {phase.name === 'error' && (
          <div className="stack gap8">
            <AiProblem error={phase.text} failure={phase.failure} onRetry={() => void run()} />
            <div className="row end gap8">
              <button className="btn ghost" onClick={onClose}>
                Закрыть
              </button>
            </div>
          </div>
        )}
        {phase.name === 'done' && (
          <>
            <p className="small muted">
              Это черновики, а не готовые карточки: ИИ мог ошибиться. Прочитай, сверь с конспектом и перепиши ответ своими словами — так запоминается лучше.
              {drafts.length > PRESET && ` Отмечено ${PRESET} из ${drafts.length}: для начала хватит, остальное добавишь потом.`}
            </p>
            <div className="bulk-list">
              {drafts.map((d, i) => (
                <div key={i} className={'bulk-row' + (d.on ? '' : ' off')}>
                  <input type="checkbox" checked={d.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label="Взять карточку" />
                  <div className="grow stack gap4">
                    <textarea rows={1} value={d.front} onChange={(e) => patch(i, { front: e.target.value })} aria-label="Вопрос" disabled={!d.on} />
                    <textarea rows={1} value={d.back} onChange={(e) => patch(i, { back: e.target.value })} aria-label="Ответ" disabled={!d.on} />
                  </div>
                </div>
              ))}
            </div>
            <div className="row end gap8">
              <button className="btn ghost" onClick={onClose}>
                Отмена
              </button>
              <button className="btn" onClick={() => void run()} title="Попросить ИИ придумать другие вопросы">
                <Icon name="repeat" size={16} /> Ещё варианты
              </button>
              <button
                className="btn primary"
                disabled={!chosen.length}
                onClick={() => {
                  for (const d of chosen) addCard({ topicId, type: 'basic', front: d.front.trim(), back: d.back.trim() });
                  toast(`Готово: ${chosen.length} ${plural(chosen.length, 'новая карточка', 'новые карточки', 'новых карточек')}`);
                  onClose();
                }}
              >
                Добавить {chosen.length} {plural(chosen.length, 'карточку', 'карточки', 'карточек')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
