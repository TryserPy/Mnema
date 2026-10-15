const ANSWER = '## Животное как биологическая система\n*Тело животного — согласованная система.*\n### Организм как система\n- Уровни: клетки → **ткани** → **органы**.\n> [!def] Биологическая система\n> организм, части которого ==согласованно выполняют функции==\n| Как передвигается | Форма тела |\n| --- | --- |\n| летает | крылья |\n[[РИСУНОК 560 120 960 420 | Рис. 8. Форма тела животных]]\n> [!tip] Запомни\n> Форма тела зависит от среды.\n[[СТРАНИЦА 2]]';
(window as any).__asked = [];
(window as any).mnemaApi = {
  load: () => null, save: async () => true, saveSync: () => true,
  aiGetConfig: async () => ({ provider: 'custom:or', visionProvider: '', speechProvider: '', models: { anthropic: '', gemini: '', local: '' }, endpoint: '', custom: [{ id: 'or', name: 'OpenRouter', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', vision: true, auth: 'bearer', headers: '', hasKey: true }], hasKey: { anthropic: false, gemini: false } }),
  aiAsk: async (req: any) => { (window as any).__asked.push(req); return { ok: true, text: ANSWER }; }
};
import('./styles.css'); import('./design.css');
const { createRoot } = await import('react-dom/client');
const { PromptsSettings } = await import('./components/PromptsSettings');
const { createElement } = await import('react');
createRoot(document.getElementById('root')!).render(createElement(PromptsSettings));
export {};
