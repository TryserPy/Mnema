import { describe, expect, it } from 'vitest';
import { placeToSave, startRoute, toggleBack } from './navMemory';
import type { AppData, Route } from './types';

describe('навигация: второе нажатие — назад, запуск — там же', () => {
  const topic: Route = { name: 'topic', id: 't1', tab: 'cards' };
  it('кнопка экрана, где уже стоишь, — назад; ссылка с разделом — нет', () => {
    expect(toggleBack({ name: 'settings' }, { name: 'settings' }, topic)).toEqual(topic);
    expect(toggleBack({ name: 'stats' }, { name: 'stats' }, { name: 'today' })).toEqual({ name: 'today' });
    expect(toggleBack({ name: 'settings', section: 'ai' }, { name: 'settings' }, topic)).toBeNull();
    expect(toggleBack({ name: 'settings' }, { name: 'today' }, topic)).toBeNull();
    expect(toggleBack({ name: 'today' }, { name: 'today' }, topic)).toBeNull();
    expect(toggleBack({ name: 'settings' }, { name: 'settings' }, null)).toBeNull();
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
