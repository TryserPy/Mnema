// Новые версии Мнемы из выпусков на GitHub. На компьютере — скачать и поставить внутри приложения
// (electron-updater), на телефоне — найти APK в выпуске и открыть ссылку: Android сам предложит установить.
import { getData, updateSettings } from './store';

export const APP_VERSION = '1.6.4';

export interface UpdateInfo {
  ok: boolean;
  error?: string;
  latest?: string | null;
  available?: boolean;
  notes?: string;
  apk?: string; // ссылка на APK (телефон)
}

/** 1.10.0 > 1.9.3 */
export function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** «https://github.com/user/mnema» или «user/mnema» → { owner, repo }. */
export function parseRepo(s: string): { owner: string; repo: string } | null {
  const m = /(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(s.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function checkUpdate(): Promise<UpdateInfo> {
  const { owner, repo } = getData().settings.update;
  if (!owner) return { ok: false, error: 'Не указано, где искать обновления' };
  const api = window.mnemaApi;
  updateSettings({ update: { ...getData().settings.update, lastCheck: new Date().toISOString() } });
  if (api?.updateCheck) {
    const r = await api.updateCheck({ owner, repo });
    return { ok: r.ok, error: r.error, latest: r.latest, available: Boolean(r.available), notes: r.notes };
  }
  // Телефон (и браузер): спросить у GitHub последний выпуск.
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    let status = 0;
    let text = '';
    if (api?.http) ({ status, text } = await api.http({ url, headers: { Accept: 'application/vnd.github+json' }, timeout: 15000 }));
    else {
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      status = res.status;
      text = await res.text();
    }
    if (status === 404) return { ok: false, error: 'В репозитории пока нет выпусков' };
    if (status >= 400) return { ok: false, error: 'GitHub ответил ошибкой ' + status };
    const j = JSON.parse(text) as { tag_name: string; body?: string; assets?: { name: string; browser_download_url: string }[] };
    const latest = j.tag_name.replace(/^v/, '');
    const apk = j.assets?.find((a) => /\.apk$/i.test(a.name))?.browser_download_url;
    return { ok: true, latest, available: newer(latest, APP_VERSION), notes: (j.body ?? '').slice(0, 2000), apk };
  } catch {
    return { ok: false, error: 'Нет интернета или GitHub недоступен' };
  }
}

/** Проверять не чаще раза в сутки. */
export function dueForAutoCheck(): boolean {
  const u = getData().settings.update;
  if (!u.owner || !u.auto) return false;
  return !u.lastCheck || Date.now() - Date.parse(u.lastCheck) > 20 * 3600_000;
}
