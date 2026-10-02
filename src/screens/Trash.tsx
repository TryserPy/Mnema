// Корзина: что удалено за последние 30 дней. Вернуть можно в один клик. Корзина лежит только на этом устройстве.
import { ConfirmButton, Icon, toast } from '../components/ui';
import { plural } from '../components/ui';
import { purgeTrash, restoreFromTrash, useData } from '../store';
import type { Route } from '../types';

const DAY = 86_400_000;
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / DAY);
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
};
const left = (iso: string) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(iso)) / DAY));

export function Trash({ go }: { go: (r: Route) => void }) {
  const items = useData().trash ?? [];
  return (
    <div className="page narrow trash-page">
      <div className="stack gap4">
        <h1 className="display">Корзина</h1>
        <span className="muted">Удалённое лежит здесь 30 дней — потом исчезает насовсем. Корзина хранится только на этом устройстве.</span>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <strong>В корзине пусто</strong>
          <span>Когда удалишь тему, предмет или карточку, они появятся здесь — их можно будет вернуть.</span>
          <button className="btn" onClick={() => go({ name: 'today' })}>
            На «Сегодня»
          </button>
        </div>
      ) : (
        <>
          <ul className="trash-list">
            {items.map((t) => (
              <li key={t.id} className="trash-item">
                <span className="trash-text">
                  <strong className="clamp2">{t.label}</strong>
                  <span className="small muted">
                    удалено {ago(t.at)} · исчезнет через {left(t.at)} {plural(left(t.at), 'день', 'дня', 'дней')}
                  </span>
                </span>
                <span className="row gap6 wrap">
                  <button
                    className="btn small primary"
                    onClick={() => {
                      if (restoreFromTrash(t.id)) toast(`Вернул: ${t.label}`);
                      else toast('Сначала верни то, в чём это лежало (предмет или тему) — потом вернётся и это.');
                    }}
                  >
                    <Icon name="repeat" size={15} /> Вернуть
                  </button>
                  <ConfirmButton className="btn small ghost danger" label="Точно навсегда?" onConfirm={() => purgeTrash(t.id)}>
                    Удалить навсегда
                  </ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
          <div className="row end">
            <ConfirmButton className="btn ghost danger" label="Очистить всё навсегда?" onConfirm={() => purgeTrash()}>
              Очистить корзину
            </ConfirmButton>
          </div>
        </>
      )}
    </div>
  );
}
