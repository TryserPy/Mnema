import { describe, expect, it } from 'vitest';
import { menuShown, type MenuItem } from './components/ui';

const noop = () => {};

describe('menuShown — группы в меню «⋯»', () => {
  it('скрытые пункты и пустые группы не показываются', () => {
    const items: MenuItem[] = [
      { label: 'А', onClick: noop },
      { label: 'Б', onClick: noop, hidden: true },
      { label: 'Группа', items: [{ label: 'В', onClick: noop, hidden: true }] }
    ];
    expect(menuShown(items).map((i) => i.label)).toEqual(['А']);
  });

  it('группа из одного видимого пункта заменяется этим пунктом', () => {
    const items: MenuItem[] = [{ label: 'Проверить себя', items: [{ label: 'В', onClick: noop, hidden: true }, { label: 'Г', onClick: noop }] }];
    const out = menuShown(items);
    expect(out.map((i) => i.label)).toEqual(['Г']);
    expect(out[0].items).toBeUndefined();
  });

  it('в группе остаются только видимые пункты', () => {
    const items: MenuItem[] = [{ label: 'Поделиться', items: [{ label: 'Файлом', onClick: noop }, { label: 'Печать', onClick: noop, hidden: true }, { label: 'Нейросеть', onClick: noop }] }];
    const out = menuShown(items);
    expect(out[0].label).toBe('Поделиться');
    expect(out[0].items?.map((i) => i.label)).toEqual(['Файлом', 'Нейросеть']);
  });
});
