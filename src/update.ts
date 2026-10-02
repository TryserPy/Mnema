// Новые версии Мнемы из выпусков на GitHub. На компьютере — скачать и поставить внутри приложения
// (electron-updater), на телефоне — скачать APK из выпуска и отдать Android на установку (Updater.java).
import { getData, updateSettings } from './store';

export const APP_VERSION = '1.12.0';

/**
 * Откуда брать обновления. Зашито в код, а не в настройки: иначе чужой файл резервной копии
 * мог бы подсунуть «обновление» из своего репозитория.
 */
export const UPDATE_REPO = { owner: 'TryserPy', repo: 'Mnema' } as const;

export interface UpdateInfo {
  ok: boolean;
  error?: string;
  latest?: string | null;
  available?: boolean;
  notes?: string;
  apk?: string; // ссылка на APK (телефон)
  size?: number; // размер APK, байт
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

/** Из ответа GitHub о выпуске — версия, текст и файл для телефона. */
export function readRelease(j: { tag_name: string; body?: string | null; assets?: { name: string; browser_download_url: string; size?: number }[] }, current = APP_VERSION): UpdateInfo {
  const latest = j.tag_name.replace(/^v/, '');
  const assets = j.assets ?? [];
  const apk = assets.find((a) => /android\.apk$/i.test(a.name)) ?? assets.find((a) => /\.apk$/i.test(a.name));
  return { ok: true, latest, available: newer(latest, current), notes: (j.body ?? '').trim().slice(0, 2000), apk: apk?.browser_download_url, size: apk?.size };
}

export async function checkUpdate(): Promise<UpdateInfo> {
  const { owner, repo } = UPDATE_REPO;
  const api = window.mnemaApi;
  updateSettings({ update: { ...getData().settings.update, lastCheck: new Date().toISOString() } });
  if (api?.updateCheck) {
    const r = await api.updateCheck({ owner, repo });
    return { ok: r.ok, error: r.error, latest: r.latest, available: Boolean(r.available), notes: r.notes };
  }
  // Телефон: спросить у GitHub последний выпуск.
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    // Только через мост приложения (в окне сеть к GitHub закрыта правилами безопасности страницы).
    if (!api?.http) return { ok: false, error: 'Обновления проверяются только в установленной Мнеме' };
    const { status, text } = await api.http({ url, headers: { Accept: 'application/vnd.github+json' }, timeout: 15000 });
    if (status === 404) return { ok: false, error: 'Новых выпусков пока нет' };
    if (status === 403 || status === 429) return { ok: false, error: 'GitHub просит подождать — попробуй через час' };
    if (status === 0) return { ok: false, error: 'Нет интернета или GitHub недоступен' };
    if (status >= 400) return { ok: false, error: 'GitHub ответил ошибкой ' + status };
    return readRelease(JSON.parse(text));
  } catch {
    return { ok: false, error: 'Нет интернета или GitHub недоступен' };
  }
}

/** Проверять не чаще раза в сутки. */
export function dueForAutoCheck(): boolean {
  const u = getData().settings.update;
  if (!u.auto || !window.mnemaApi) return false; // в обычном браузере обновлять нечего
  return !u.lastCheck || Date.now() - Date.parse(u.lastCheck) > 20 * 3600_000;
}
