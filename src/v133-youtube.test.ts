// 1.33, №11: субтитры YouTube — разбор страницы и InnerTube на нескольких форматах, порядок дорожек,
// запасные пути (json3 пустой → XML → клиент Android), честные причины и формы ссылок.
import { describe, expect, it } from 'vitest';
import { captionsText, playerTracks, rankTracks, youtubeCaptions, youtubePage, YT_WHY, type CaptionTrack } from '../shared/readable.mjs';
import { youtubeId } from '../shared/urlGuard.mjs';

const ID = 'dQw4w9WgXcQ';
const T = (lang: string, auto = false, extra = ''): CaptionTrack => ({ lang, auto, url: `https://www.youtube.com/api/timedtext?v=${ID}&lang=${lang}${auto ? '&kind=asr' : ''}${extra}` });
const raw = (t: CaptionTrack) => ({ baseUrl: t.url, languageCode: t.lang, ...(t.auto ? { kind: 'asr' } : {}), name: { simpleText: t.lang } });
const player = (tracks: CaptionTrack[], extra: Record<string, unknown> = {}) => ({
  playabilityStatus: { status: 'OK' },
  videoDetails: { videoId: ID, title: 'Клетка за 5 минут' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks.map(raw) } },
  ...extra
});
/** Страница как в 2026: плеер в var ytInitialPlayerResponse, ключ в ytcfg; ссылки с &. */
const page = (p: object) =>
  `<html><head><title>Клетка за 5 минут - YouTube</title></head><body><script>ytcfg.set({"INNERTUBE_API_KEY":"AIzaSyTESTKEY0123456789abcdefghijkl"});</script><script>var ytInitialPlayerResponse = ${JSON.stringify(p).replace(/&/g, '\\u0026')};var meta = {};</script></body></html>`;
const JSON3 = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'Клетка' }, { utf8: ' — единица жизни' }] }, { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: '[Музыка]' }] }, { tStartMs: 9000, dDurationMs: 1000, segs: [{ utf8: 'Ядро хранит ДНК' }] }] });
const XML = '<?xml version="1.0" encoding="utf-8" ?><transcript><text start="0" dur="1.5">Клетка &amp;amp; ядро</text><text start="5" dur="1">митохондрии</text></transcript>';
const SRV3 = '<timedtext format="3"><body><p t="0" d="1500"><s>Клетка</s><s> делится</s></p><p t="6000" d="900">митозом</p></body></timedtext>';

function net(routes: { get?: (u: string) => string; post?: (u: string, b: string) => string }) {
  const log: string[] = [];
  return {
    log,
    get: async (u: string) => (log.push('GET ' + u), { text: routes.get?.(u) ?? '' }),
    post: async (u: string, b: string) => (log.push('POST ' + u), { text: routes.post?.(u, b) ?? '' })
  };
}

describe('форматы субтитров', () => {
  it('json3, XML timedtext и srv3 → текст абзацами, без [Музыка]', () => {
    expect(captionsText(JSON3)).toBe('Клетка — единица жизни\n\nЯдро хранит ДНК');
    expect(captionsText(XML)).toBe('Клетка & ядро\n\nмитохондрии');
    expect(captionsText(SRV3)).toBe('Клетка делится\n\nмитозом');
    expect(captionsText('')).toBe('');
  });
});

describe('страница видео и InnerTube', () => {
  it('плеер в странице: название, ключ, дорожки (ручные и asr)', () => {
    const p = youtubePage(page(player([T('ru', true), T('en')])));
    expect(p).toMatchObject({ title: 'Клетка за 5 минут', apiKey: 'AIzaSyTESTKEY0123456789abcdefghijkl', state: 'ok' });
    expect(p.tracks.map((t) => [t.lang, t.auto])).toEqual([['ru', true], ['en', false]]);
    expect(p.tracks[0].url).toContain('&lang=ru');
  });
  it('согласие с cookies, возраст, «не бот» — своё состояние', () => {
    expect(youtubePage('<form action="https://consent.youtube.com/save">').state).toBe('consent');
    expect(youtubePage(page(player([], { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } }))).state).toBe('age');
    expect(youtubePage(page(player([], { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" } }))).state).toBe('bot');
    expect(playerTracks(JSON.stringify(player([], { playabilityStatus: { status: 'ERROR', reason: 'Video unavailable' } }))).state).toBe('unavailable');
  });
});

describe('порядок дорожек', () => {
  it('ручные на нужном → ручные любые → авто на нужном → авто любые', () => {
    const order = rankTracks([T('de', true), T('ru', true), T('de'), T('en'), T('ru')]).map((t) => `${t.lang}${t.auto ? '*' : ''}`);
    expect(order).toEqual(['ru', 'en', 'de', 'ru*', 'de*']);
  });
});

describe('youtubeCaptions', () => {
  it('обычный путь: страница → json3 ручной русской дорожки', async () => {
    const n = net({ get: (u) => (u.includes('/watch') ? page(player([T('ru', true), T('ru')])) : u.includes('kind=asr') ? '' : JSON3) });
    const r = await youtubeCaptions(ID, n.get, n.post);
    expect(r).toMatchObject({ title: 'Клетка за 5 минут', lang: 'ru', auto: false });
    expect(r.text).toContain('Ядро хранит ДНК');
    expect(n.log.some((l) => l.startsWith('POST'))).toBe(false);
  });

  it('json3 пустой (ссылка с exp=xpe без PO-токена) → тот же адрес в XML', async () => {
    const n = net({ get: (u) => (u.includes('/watch') ? page(player([T('ru', false, '&exp=xpe')])) : u.includes('fmt=json3') ? '' : XML) });
    expect((await youtubeCaptions(ID, n.get, n.post)).text).toBe('Клетка & ядро\n\nмитохондрии');
  });

  it('веб-ссылки пустые → клиент Android (InnerTube), только автоматические английские', async () => {
    const n = net({
      get: (u) => (u.includes('/watch') ? page(player([T('ru', false, '&exp=xpe')])) : u.includes('android=1') ? JSON3 : ''),
      post: (u, b) => {
        expect(u).toMatch(/^https:\/\/www\.youtube\.com\/youtubei\/v1\/player\?key=AIzaSyTESTKEY/);
        expect(JSON.parse(b)).toMatchObject({ videoId: ID, context: { client: { clientName: 'ANDROID' } } });
        return JSON.stringify(player([T('en', true, '&android=1')]));
      }
    });
    expect(await youtubeCaptions(ID, n.get, n.post)).toMatchObject({ lang: 'en', auto: true });
  });

  it('нет дорожек нигде → честное «субтитров нет»', async () => {
    const n = net({ get: () => page(player([])), post: () => JSON.stringify(player([])) });
    await expect(youtubeCaptions(ID, n.get, n.post)).rejects.toMatchObject({ code: 'none', message: YT_WHY.none });
  });

  it('дорожки есть, но текст не отдают → «не отдал», а не «нет субтитров»', async () => {
    const n = net({ get: (u) => (u.includes('/watch') ? page(player([T('ru')])) : ''), post: () => JSON.stringify(player([T('ru')])) });
    await expect(youtubeCaptions(ID, n.get, n.post)).rejects.toMatchObject({ code: 'empty' });
  });

  it('возрастное ограничение → своя причина', async () => {
    const age = player([], { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm your age' } });
    const n = net({ get: () => page(age), post: () => JSON.stringify(age) });
    await expect(youtubeCaptions(ID, n.get, n.post)).rejects.toMatchObject({ code: 'age' });
  });

  it('ссылка на субтитры не на YouTube — не запрашивается (подмена в ответе)', async () => {
    const evil: CaptionTrack = { lang: 'ru', auto: false, url: 'http://169.254.169.254/latest/meta-data' };
    const n = net({ get: (u) => (u.includes('/watch') ? page(player([evil])) : JSON3), post: () => '{}' });
    await expect(youtubeCaptions(ID, n.get, n.post)).rejects.toMatchObject({ code: 'empty' });
    expect(n.log.some((l) => l.includes('169.254'))).toBe(false);
  });

  it('неверный id — без запросов', async () => {
    const n = net({});
    await expect(youtubeCaptions('../../etc', n.get, n.post)).rejects.toMatchObject({ code: 'unavailable' });
    expect(n.log).toEqual([]);
  });
});

describe('формы ссылок', () => {
  it.each([
    [`https://youtu.be/${ID}?t=42`, ID],
    [`https://www.youtube.com/watch?v=${ID}&list=PL123&t=1m2s`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://music.youtube.com/watch?v=${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}?start=10`, ID],
    [`https://www.youtube-nocookie.com/embed/${ID}`, ID],
    [`https://www.youtube.com/live/${ID}`, ID],
    ['https://www.youtube.com/watch?v=short', null],
    ['https://evil.example/watch?v=dQw4w9WgXcQ', null]
  ])('%s', (u, id) => expect(youtubeId(u)).toBe(id));
});
