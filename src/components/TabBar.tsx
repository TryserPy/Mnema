// Нижняя панель телефона: Учусь · Знания · ＋ · Профиль. Подписи под значками — без подписей непонятно, куда нажимать.
import type { Route } from '../types';
import { openCreate } from './CreateMenu';
import { Icon } from './ui';

/** На этих экранах панель прячется: в повторении и тесте ничто не должно отвлекать. */
export const hidesTabBar = (r: Route) => r.name === 'review' || r.name === 'test';

export function TabBar({ route, go, dueAll }: { route: Route; go: (r: Route) => void; dueAll: number }) {
  if (hidesTabBar(route)) return null;
  const inKnowledge = route.name === 'knowledge' || route.name === 'subject' || route.name === 'topic' || route.name === 'folder';
  const inProfile = ['profile', 'trash', 'stats', 'settings', 'features', 'help'].includes(route.name);
  const learn = route.name === 'today';
  return (
    <nav className="tabbar" aria-label="Разделы">
      <button type="button" className={'tab' + (learn ? ' on' : '')} aria-current={learn ? 'page' : undefined} onClick={() => go({ name: 'today' })}>
        <span className="tab-ico">
          <Icon name="home" size={24} />
          {dueAll > 0 && <span className="tab-badge">{dueAll > 99 ? '99+' : dueAll}</span>}
        </span>
        <span className="tab-label">Учусь</span>
      </button>
      <button type="button" className={'tab' + (inKnowledge ? ' on' : '')} aria-current={inKnowledge ? 'page' : undefined} onClick={() => go({ name: 'knowledge' })}>
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
      <button type="button" className={'tab' + (inProfile ? ' on' : '')} aria-current={inProfile ? 'page' : undefined} onClick={() => go({ name: 'profile' })}>
        <span className="tab-ico">
          <Icon name="sliders" size={24} />
        </span>
        <span className="tab-label">Профиль</span>
      </button>
    </nav>
  );
}
