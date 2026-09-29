// Видео по ссылке: YouTube, Rutube, VK Видео или прямой файл .mp4/.webm.
export const VIDEO_ALT = 'video';

export interface VideoInfo {
  kind: 'youtube' | 'rutube' | 'vk' | 'file';
  embed: string; // адрес для встроенного плеера
  thumb?: string; // картинка-превью
  url: string; // исходная ссылка (открыть в браузере)
  label: string;
}

function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function parseVideo(raw: string): VideoInfo | null {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  // YouTube
  let yt: string | null = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') yt = u.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([\w-]{6,})/.exec(u.pathname);
      if (m) yt = m[1];
    }
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
    return {
      kind: 'youtube',
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&autoplay=1${start ? '&start=' + start : ''}`,
      thumb: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      url: s,
      label: 'YouTube'
    };
  }
  // Rutube
  if (host === 'rutube.ru') {
    const m = /^\/(?:video|play\/embed|shorts)\/([0-9a-f]{20,40})/i.exec(u.pathname);
    if (m) return { kind: 'rutube', embed: `https://rutube.ru/play/embed/${m[1]}`, url: s, label: 'Rutube' };
  }
  // VK Видео
  if (host === 'vk.com' || host === 'vkvideo.ru' || host === 'vk.ru') {
    const m = /video(-?\d+)_(\d+)/.exec(u.pathname + u.search);
    if (m) return { kind: 'vk', embed: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2&autoplay=1`, url: s, label: 'VK Видео' };
  }
  // Прямой файл
  if (/\.(mp4|webm|ogv|mov)(\?|$)/i.test(u.pathname)) return { kind: 'file', embed: s, url: s, label: 'Видео' };
  return null;
}

export const VIDEO_FRAME_HOSTS = ['https://www.youtube-nocookie.com/', 'https://rutube.ru/', 'https://vk.com/'];
