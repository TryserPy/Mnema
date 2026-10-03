// «Профиль»: сверху «Мой прогресс» — три числа и ссылка на подробности, ниже всё остальное (настройки, возможности, корзина, копии, справка).
import { useMemo } from 'react';
import { Icon, plural } from '../components/ui';
import { periodStats } from '../progress';
import { dayStart, DAY, streak } from '../srs';
import { useData } from '../store';
import type { Route } from '../types';

export const profileLinks = (trashCount: number): { icon: string; title: string; hint: string; to: Route }[] => [
  { icon: 'sliders', title: 'Настройки', hint: 'Вид, напоминания, данные', to: { name: 'settings' } },
  { icon: 'grid', title: 'Возможности', hint: 'Что включено в Мнеме', to: { name: 'features' } },
  { icon: 'repeat', title: 'Автокопии', hint: 'Копии твоих данных — можно вернуть вчерашнее', to: { name: 'settings', section: 'data' } },
  { icon: 'trash', title: 'Корзина', hint: trashCount ? `Удалённое можно вернуть (${trashCount})` : 'Пока пусто — удалённое можно вернуть', to: { name: 'trash' } },
  { icon: 'help', title: 'Справка', hint: 'Как учиться и как пользоваться', to: { name: 'help' } }
];

export function Profile({ go }: { go: (r: Route) => void }) {
  const data = useData();
  const now = useMemo(() => new Date(), [data]);
  const week = useMemo(() => periodStats(data, dayStart(now, data.settings.dayStartHour).getTime() - 6 * DAY), [data, now]);
  const days = streak(data, now);
  const learned = useMemo(() => Object.values(data.states).filter((s) => s.state === 2).length, [data]);
  return (
    <div className="page narrow prof-page">
      <h1 className="display">Профиль</h1>
      <section className="card stack gap12 prof-progress" aria-label="Мой прогресс">
        <div className="row between gap8 wrap">
          <h3 className="row gap8">
            <Icon name="chart" size={18} /> Мой прогресс
          </h3>
          <button className="btn small" onClick={() => go({ name: 'stats' })}>
            Подробнее
          </button>
        </div>
        <div className="prof-kpis">
          <div>
            <span className="kpi-num">{learned}</span>
            <span className="small muted">{plural(learned, 'карточка выучена', 'карточки выучено', 'карточек выучено')}</span>
          </div>
          <div>
            <span className="kpi-num">{week.answers}</span>
            <span className="small muted">{plural(week.answers, 'ответ', 'ответа', 'ответов')} за неделю</span>
          </div>
          <div>
            <span className="kpi-num">{days}</span>
            <span className="small muted">{plural(days, 'день', 'дня', 'дней')} подряд</span>
          </div>
        </div>
      </section>
      <div className="create-list prof-links">
        {profileLinks(data.trash?.length ?? 0).map((l) => (
          <button key={l.title} type="button" className="create-item" onClick={() => go(l.to)}>
            <span className="create-ico">
              <Icon name={l.icon} size={22} />
            </span>
            <span className="create-text">
              <strong>{l.title}</strong>
              <span className="small muted">{l.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
