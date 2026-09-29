// Простая шина событий для модов: «ответил на карточку», «данные изменились», «открыт экран».
type Fn = (payload: unknown) => void;
const handlers = new Map<string, Set<Fn>>();

export function on(name: string, fn: Fn): () => void {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)!.add(fn);
  return () => handlers.get(name)?.delete(fn);
}

export function emit(name: string, payload?: unknown) {
  for (const fn of handlers.get(name) ?? []) {
    try {
      fn(payload);
    } catch (e) {
      console.error('Мод упал на событии', name, e);
    }
  }
}
