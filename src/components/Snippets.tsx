// Сниппеты «мой CSS» — свои кусочки CSS, каждый включается отдельно. Живут в «Оформлении» и во вкладке «CSS» редактора.
import { useState } from 'react';
import { getData, updateSettings, useData } from '../store';
import { newStyleId } from '../styleSystem';
import type { CssSnippet } from '../types';
import { Collapse, Icon } from './ui';

/** Сниппеты «мой CSS»: короткие кусочки своего CSS, каждый включается отдельно (как в Obsidian). Изменения видны сразу. */
export function Snippets() {
  const data = useData();
  const list = data.settings.cssSnippets;
  const [open, setOpen] = useState<string | null>(null);
  const upd = (id: string, patch: Partial<CssSnippet>) => updateSettings({ cssSnippets: getData().settings.cssSnippets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  return (
    <div className="stack gap8">
      <span className="sgroup-title">Мой CSS — сниппеты</span>
      <span className="small muted">Кусочки своего CSS. Каждый включается отдельно и применяется после стилей. Переменные и классы — в справке редактора стилей. Ссылки на интернет не работают.</span>
      {list.length > 0 && (
        <div className="st-snips">
          {list.map((sn) => (
            <div key={sn.id} className="st-snip">
              <div className="row gap8">
                <button type="button" role="switch" aria-checked={sn.on} aria-label={`Сниппет «${sn.name}»`} className={'switch' + (sn.on ? ' on' : '')} onClick={() => upd(sn.id, { on: !sn.on })}>
                  <span />
                </button>
                <input className="input grow" aria-label="Название сниппета" value={sn.name} maxLength={40} onChange={(e) => upd(sn.id, { name: e.target.value })} />
                <button className={'btn small' + (open === sn.id ? ' on' : '')} aria-expanded={open === sn.id} onClick={() => setOpen(open === sn.id ? null : sn.id)}>
                  <Icon name="code" size={15} /> CSS
                </button>
                <button className="icon-btn small" aria-label={`Удалить сниппет «${sn.name}»`} onClick={() => updateSettings({ cssSnippets: getData().settings.cssSnippets.filter((x) => x.id !== sn.id) })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <Collapse open={open === sn.id}>
                <textarea className="input css-area" spellCheck={false} aria-label={`CSS сниппета «${sn.name}»`} value={sn.css} onChange={(e) => upd(sn.id, { css: e.target.value })} placeholder={'.hero { background: linear-gradient(135deg, var(--accent), #C2417A); }'} />
              </Collapse>
            </div>
          ))}
        </div>
      )}
      <div>
        <button
          className="btn small"
          onClick={() => {
            const id = newStyleId();
            updateSettings({ cssSnippets: [...getData().settings.cssSnippets, { id, name: 'Сниппет ' + (list.length + 1), css: '', on: true }] });
            setOpen(id);
          }}
        >
          <Icon name="plus" size={16} /> Добавить сниппет
        </button>
      </div>
    </div>
  );
}

