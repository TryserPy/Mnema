import { describe, expect, it } from 'vitest';
import { placeToSave, repress, startRoute } from './navMemory';
import type { AppData, Route } from './types';

describe('навигация: второе нажатие — экран с нуля, запуск — там же', () => {
  const topic: Route = { name: 'topic', id: 't1', tab: 'cards' };
  it('кнопка экрана, где уже стоишь, — тот же экран в начальном состоянии; ссылка с разделом — обычный переход', () => {
    expect(repress({ name: 'settings' }, { name: 'settings', section: 'look' })).toEqual({ name: 'settings' });
    expect(repress({ name: 'stats' }, { name: 'stats', tab: 'map' })).toEqual({ name: 'stats' });
    expect(repress({ name: 'help' }, { name: 'help', section: 'use' })).toEqual({ name: 'help' });
    expect(repress({ name: 'settings', section: 'ai' }, { name: 'settings' })).toBeNull();
    expect(repress({ name: 'settings' }, { name: 'today' })).toBeNull();
    expect(repress({ name: 'topic', id: 't1' }, topic)).toBeNull();
  });
  it('повторение не восстанавливается — только экран, откуда его запустили', () => {
    expect(placeToSave({ name: 'review', back: topic })).toEqual(topic);
    expect(placeToSave({ name: 'review' })).toBeNull();
    expect(placeToSave({ name: 'stats' })).toEqual({ name: 'stats' });
  });
  it('без памяти (или удалённая тема) — «Сегодня»', () => {
    const data = { topics: [], subjects: [], folders: [] } as unknown as AppData;
    expect(startRoute(data)).toEqual({ name: 'today' });
  });
});
