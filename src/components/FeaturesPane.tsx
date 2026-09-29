// «Возможности»: плитки по группам — видно всё сразу, без длинной ленты. Подробности — в окне.
import { useState } from 'react';
import { FEATURES, GROUPS, type FeatureInfo } from '../featureList';
import { setFeature, updateSettings, useData } from '../store';
import { Icon, Modal, Segmented, Switch } from './ui';
import { PaneHead } from './SettingsKit';

type Filter = 'all' | 'on' | 'off';

function FeatureDetail({ f, onClose, openSection }: { f: FeatureInfo; onClose: () => void; openSection: (id: string) => void }) {
  const data = useData();
  const s = data.settings;
  const on = s.features[f.id];
  return (
    <Modal title={f.title} onClose={onClose} width={520}>
      <div className="stack gap16">
        <div className="feat-detail-head">
          <span className="feat-ico big">
            <Icon name={f.icon} size={26} />
          </span>
          <p className="grow">{f.text}</p>
        </div>
        <div className="feat-where">
          <Icon name="info" size={16} /> <span>Где: {f.where}</span>
        </div>
        {f.id === 'focus' && on && (
          <div className="row gap12 wrap">
            <label className="row gap6 small">
              Заниматься
              <select className="input" value={s.focusMinutes} onChange={(e) => updateSettings({ focusMinutes: Number(e.target.value) })}>
                {[10, 15, 20, 25, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m} мин
                  </option>
                ))}
              </select>
            </label>
            <label className="row gap6 small">
              Перерыв
              <select className="input" value={s.breakMinutes} onChange={(e) => updateSettings({ breakMinutes: Number(e.target.value) })}>
                {[3, 5, 10, 15].map((m) => (
                  <option key={m} value={m}>
                    {m} мин
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="row gap12 feat-detail-foot">
          <Switch label={f.title} checked={on} onChange={(v) => setFeature(f.id, v)} />
          <span className="grow">{on ? 'Включено' : 'Выключено'}</span>
          {f.settings && on && (
            <button
              className="btn small"
              onClick={() => {
                onClose();
                openSection(f.settings!);
              }}
            >
              Настроить <Icon name="right" size={16} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function FeaturesPane({ openSection }: { openSection: (id: string) => void }) {
  const data = useData();
  const f = data.settings.features;
  const [filter, setFilter] = useState<Filter>('all');
  const [detail, setDetail] = useState<FeatureInfo | null>(null);
  const android = window.mnemaApi?.platform === 'android';
  const list = FEATURES.filter((x) => !(android && x.desktopOnly)).filter((x) => filter === 'all' || (filter === 'on' ? f[x.id] : !f[x.id]));
  const onCount = FEATURES.filter((x) => f[x.id]).length;
  return (
    <div className="stack gap16">
      <PaneHead title="Возможности" text="Включай только то, что нужно. Выключенное нигде не видно и не мешает.">
        <div className="ctl-seg small-seg">
          <Segmented
            ariaLabel="Показать"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'on', label: `Вкл · ${onCount}` },
              { value: 'off', label: 'Выкл' }
            ]}
          />
        </div>
      </PaneHead>
      {GROUPS.map((g) => {
        const items = list.filter((x) => x.group === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id + filter} className="feat-group" data-set={'group-' + g.id}>
            <h3 className="sgroup-title">{g.title}</h3>
            <div className="feat-grid">
              {items.map((x, i) => (
                <div key={x.id} className={'feat-tile' + (f[x.id] ? ' on' : '')} data-set={'feature-' + x.id} style={{ animationDelay: Math.min(i, 8) * 25 + 'ms' }}>
                  <button className="feat-main" onClick={() => setDetail(x)} aria-label={`${x.title}: подробнее`}>
                    <span className="feat-ico">
                      <Icon name={x.icon} size={20} />
                    </span>
                    <span className="feat-text">
                      <strong>{x.title}</strong>
                      <span>{x.short}</span>
                    </span>
                  </button>
                  <Switch label={x.title} checked={f[x.id]} onChange={(v) => setFeature(x.id, v)} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {list.length === 0 && <div className="empty-soft">Здесь пусто.</div>}
      {detail && <FeatureDetail f={detail} onClose={() => setDetail(null)} openSection={openSection} />}
    </div>
  );
}
