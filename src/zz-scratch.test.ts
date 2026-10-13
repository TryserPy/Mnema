import { it, vi } from 'vitest';
vi.mock('dompurify', () => ({ default: { isSupported: false, sanitize: (h: string) => h, addHook() {} } }));
import { renderMarkdown } from './components/Markdown';
it('x', () => {
  console.log(renderMarkdown('Текст\n> [!def] **Фотосинтез**\n> образование\n>\n> - пункт [стр. 3] {?слово?}\n\n> [!note]\n> чужая\n\n> [!tip]- Свёрнутая\n> скрыто\n\n> обычная\n> [!tip] не выноска\n\n- список\n  > [!warn] Внимание\n  > в списке\n\n> [!rule] <b>x</b>'));
});
