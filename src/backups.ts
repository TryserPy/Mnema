// Автокопии: Мнема сама раз в день сохраняет копию данных (компьютер — при запуске, телефон — перед первым сохранением дня),
// хранятся 8 последних. Здесь — подписи для списка: день по имени файла, «Сегодня/Вчера/3 октября», размер.

/** День копии по имени файла «mnema-2026-10-03.json»; чужое имя — null. */
export function backupDay(name: string): string | null {
  const m = /^mnema-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(name);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «Сегодня», «Вчера», «3 октября», «3 октября 2025» (если год не текущий). */
export function dayLabel(day: string, today: Date = new Date()): string {
  const [y, m, d] = day.split('-').map(Number);
  const local = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (day === local(today)) return 'Сегодня';
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (day === local(yest)) return 'Вчера';
  return `${d} ${MONTHS[m - 1]}${y !== today.getFullYear() ? ' ' + y : ''}`;
}

/** «820 Б», «12 КБ», «1,4 МБ». */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
