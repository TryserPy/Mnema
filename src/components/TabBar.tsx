// Нижняя панель телефона: Учусь · Знания · ＋ · Профиль. Подписи под значками — без подписей непонятно, куда нажимать.
import { useState } from 'react';
import type { Route } from '../types';
import { openCreate } from './CreateMenu';
import { Icon, Modal } from './ui';

/** На этих экранах панель прячется: в повторении и тесте ничто не должно отвлекать. */
export const hidesTabBar = (r: Route) => r.name === 'review' || r.name === 'test';

export function TabBar({ route, go, dueAll, onKnowledge, knowledgeOpen }: { route: Route; go: (r: Route) => void; dueAll: number; onKnowledge: () => void; knowledgeOpen: boolean }) {
  const [profile, setProfile] = useState(false);
  if (hidesTabBar(route)) return null;
  const inKnowledge = knowledgeOpen || route.name === 'subject' || route.name === 'topic' || route.name === 'folder';
  const inProfile = route.name === 'trash' || route.name === 'stats' || route.name === 'settings' || route.name === 'features' || route.name === 'help';
  const learn = route.name === 'today' && !knowledgeOpen;
  return (
    <>
      <nav className="tabbar" aria-label="Разделы">
        <button type="button" className={'tab' + (learn ? ' on' : '')} aria-current={learn ? 'page' : undefined} onClick={() => go({ name: 'today' })}>
          <span className="tab-ico">
            <Icon name="home" size={24} />
            {dueAll > 0 && <span className="tab-badge">{dueAll > 99 ? '99+' : dueAll}</span>}
          </span>
          <span className="tab-label">Учусь</span>
        </button>
        <button type="button" className={'tab' + (inKnowledge ? ' on' : '')} aria-current={inKnowledge ? 'page' : undefined} onClick={onKnowledge}>
          <span className="tab-ico">
            <Icon name="book" size={24} />
          </span>
          <span className="tab-label">Знания</span>
        </button>
        <button type="button" className="tab tab-plus" aria-label="Создать" onClick={openCreate}>
          <span className="tab-ico">
            <span className="tab-plus-dot">
              <Icon name="plus" size={24} />
            </span>
          </span>
          <span className="tab-label">Создать</span>
        </button>
        <button type="button" className={'tab' + (inProfile ? ' on' : '')} aria-current={inProfile ? 'page' : undefined} onClick={() => setProfile(true)}>
          <span className="tab-ico">
            <Icon name="sliders" size={24} />
          </span>
          <span className="tab-label">Профиль</span>
        </button>
      </nav>
      {profile && (
        <Modal title="Профиль" onClose={() => setProfile(false)} width={420}>
          <div className="create-list" role="menu">
            {(
              [
                ['chart', 'Мой прогресс', 'Сколько выучено и как идёт учёба', { name: 'stats' }],
                ['sliders', 'Настройки', 'Вид, напоминания, данные', { name: 'settings' }],
                ['grid', 'Возможности', 'Что включено в Мнеме', { name: 'features' }],
                ['trash', 'Корзина', 'Недавно удалённое — можно вернуть', { name: 'trash' }],
                ['help', 'Справка', 'Как учиться и как пользоваться', { name: 'help' }]
              ] as [string, string, string, Route][]
            ).map(([icon, title, hint, to]) => (
              <button
                key={title}
                type="button"
                role="menuitem"
                className="create-item"
                onClick={() => {
                  setProfile(false);
                  go(to);
                }}
              >
                <span className="create-ico">
                  <Icon name={icon} size={22} />
                </span>
                <span className="create-text">
                  <strong>{title}</strong>
                  <span className="small muted">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
