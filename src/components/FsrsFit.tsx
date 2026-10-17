// «Подогнать расписание под меня» (1.32, N4): простыми словами, без «FSRS» и «параметров».
// Подгонка идёт на устройстве, по журналу ответов; включается только по кнопке и выключается одной кнопкой.
import { useMemo, useState } from 'react';
import { countPredictions, FIT_MIN_REVIEWS, fitParameters, histories, intervalShift, type FitResult } from '../fsrsFit';
import { getData, updateSettings, useData } from '../store';
import { ConfirmButton, Modal, plural, toast } from './ui';

const pct = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')}\u00a0%`;
const dateRu = (iso: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');

/** Подпись строки в настройках: подогнано или нет. */
export function fitHint(s: ReturnType<typeof useData>['settings']): string {
  const p = s.fsrsParams;
  return p ? `Подогнано ${dateRu(p.at)} по ${p.reviews} ${plural(p.reviews, 'ответу', 'ответам', 'ответам')}: прогноз точнее (ошибка ${pct(p.before)} → ${pct(p.after)})` : 'Повторения придут точнее, когда Refrain изучит твои ответы';
}

/** Насколько изменится интервал «Хорошо» — словами. */
function shiftWords(k: number): string {
  const d = Math.round(Math.abs(k - 1) * 100);
  if (d < 5) return 'Интервалы почти не изменятся — зато прогноз точнее.';
  return k > 1 ? `Карточки, которые ты помнишь, будут возвращаться примерно на ${d} % реже.` : `Карточки будут возвращаться примерно на ${d} % чаще — так ты меньше забудешь.`;
}

export function FsrsFitDialog({ onClose }: { onClose: () => void }) {
  const data = useData();
  const s = data.settings;
  const have = useMemo(() => countPredictions(histories(data.logs)), [data.logs]);
  // Сколько подходящих ответов в день в последние две недели — чтобы сказать, когда хватит.
  const perDay = useMemo(() => {
    const from = Date.now() - 14 * 86400000;
    return Math.max(1, data.logs.filter((l) => Date.parse(l.at) > from && l.prevState >= 2).length / 14);
  }, [data.logs]);
  const [busy, setBusy] = useState<number | null>(null);
  const [res, setRes] = useState<FitResult | null>(null);

  async function run() {
    setRes(null);
    setBusy(0);
    try {
      setRes(await fitParameters(getData().logs, { onProgress: (f) => setBusy(f) }));
    } catch (e) {
      toast('Не получилось: ' + ((e as Error).message || 'ошибка'));
    } finally {
      setBusy(null);
    }
  }

  const need = Math.max(0, FIT_MIN_REVIEWS - have);
  return (
    <Modal title="Подогнать расписание под меня" onClose={onClose} width={560} sticky={busy !== null}>
      <div className="stack gap12">
        <p className="small">
          Refrain решает, когда показать карточку снова, по тому, как забывают в среднем. Твоя память может работать быстрее или медленнее — по твоим ответам Refrain подстроит расписание: повторения придут не раньше и не позже, чем нужно.
        </p>
        <p className="small muted">Считается здесь, на устройстве. Уже назначенные даты не сдвинутся — новое расписание начнётся со следующего ответа на каждую карточку.</p>

        {s.fsrsParams && !res && (
          <div className="hint ok">
            Сейчас расписание подогнано {dateRu(s.fsrsParams.at)} по {s.fsrsParams.reviews} {plural(s.fsrsParams.reviews, 'ответу', 'ответам', 'ответам')}. Ошибка прогноза: {pct(s.fsrsParams.before)} → {pct(s.fsrsParams.after)}.
          </div>
        )}

        {need > 0 ? (
          <div className="stack gap8">
            <div className="progress full" role="progressbar" aria-valuemin={0} aria-valuemax={FIT_MIN_REVIEWS} aria-valuenow={have} aria-label="Сколько ответов набрано">
              <span style={{ width: `${(have / FIT_MIN_REVIEWS) * 100}%` }} />
            </div>
            <p className="small">
              Нужно больше ответов: {have} из {FIT_MIN_REVIEWS}. Считаются повторения хотя бы через день после прошлого. При твоём темпе хватит примерно через {Math.ceil(need / perDay)} {plural(Math.ceil(need / perDay), 'день', 'дня', 'дней')}.
            </p>
          </div>
        ) : (
          <p className="small muted">
            Ответов для подгонки: {have}. Это займёт до минуты.
          </p>
        )}

        {busy !== null && (
          <div className="stack gap8" role="status" aria-live="polite">
            <div className="progress full">
              <span style={{ width: `${Math.round(busy * 100)}%` }} />
            </div>
            <span className="small muted">Изучаю твои ответы… {Math.round(busy * 100)} %</span>
          </div>
        )}

        {res?.ok && res.better && (
          <div className="stack gap8">
            <div className="hint ok">
              Прогноз стал точнее: ошибка {pct(res.params.before)} → {pct(res.params.after)}. {shiftWords(intervalShift(res.params.w, s.retention))}
            </div>
            <div className="row end gap8 wrap">
              <button className="btn ghost" onClick={() => setRes(null)}>
                Не надо
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  updateSettings({ fsrsParams: res.params });
                  toast('Расписание подогнано под тебя');
                  onClose();
                }}
              >
                Включить
              </button>
            </div>
          </div>
        )}
        {res?.ok && !res.better && <div className="hint">Твои ответы хорошо совпадают с обычным расписанием — менять нечего. Попробуй через месяц-другой.</div>}

        <div className="row end gap8 wrap">
          {s.fsrsParams && (
            <ConfirmButton className="btn ghost" label="Точно вернуть?" onConfirm={() => (updateSettings({ fsrsParams: undefined }), toast('Вернул обычное расписание'))}>
              Вернуть обычное
            </ConfirmButton>
          )}
          {!(res?.ok && res.better) && (
            <button className="btn primary" disabled={need > 0 || busy !== null} onClick={() => void run()}>
              {s.fsrsParams || res ? 'Подогнать заново' : 'Подогнать'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
