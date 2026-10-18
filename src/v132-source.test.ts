// 1.32, N2: карточки из ссылки, видео и книги — проверка адресов (SSRF), текст статьи и субтитров, EPUB, запрос к ИИ.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { articleText, captionsText, pickTrack, youtubeTracks } from '../shared/readable.mjs';
import { checkUrl, parseIPv4, privateIPv6, youtubeId } from '../shared/urlGuard.mjs';
import { parseEpub, resolvePath } from './epub';
import { sourceParts } from './sourceCards';

afterEach(() => vi.unstubAllGlobals());

describe('адрес ссылки', () => {
  it('внутренние адреса, логин, порты и не-http — нельзя', () => {
    for (const u of ['http://127.0.0.1', 'http://localhost/', 'localhost', 'http://10.1.2.3/', 'http://172.20.0.1/', 'http://192.168.0.1/', 'http://169.254.169.254/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/', 'http://nas/', 'http://pc.lan/', 'http://x.internal/', 'https://a:b@example.org/', 'https://example.org:8443/', 'ftp://example.org/', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,1'])
      expect(checkUrl(u).ok, u).toBe(false);
  });
  it('обычные сайты — можно; без схемы — https', () => {
    expect(checkUrl('ru.wikipedia.org/wiki/Клетка')).toEqual({ ok: true, url: 'https://ru.wikipedia.org/wiki/%D0%9A%D0%BB%D0%B5%D1%82%D0%BA%D0%B0' });
    expect(checkUrl('http://example.org:80/a#frag')).toEqual({ ok: true, url: 'http://example.org/a' });
    expect(checkUrl('https://8.8.8.8/').ok).toBe(true);
  });
  it('IPv4 в любой записи и IPv6', () => {
    expect(parseIPv4('127.1')).toEqual([127, 0, 0, 1]);
    expect(parseIPv4('0x7f000001')).toBeNull();
    expect(parseIPv4('2130706433')).toEqual([127, 0, 0, 1]);
    expect(privateIPv6('[::ffff:7f00:1]')).toBe(true);
    expect(privateIPv6('2a00:1450::1')).toBe(false);
  });
  it('id видео YouTube из любой ссылки', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ']) expect(youtubeId(u), u).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(youtubeId('https://youtube.com/watch?v=short')).toBeNull();
  });
});

describe('текст статьи и субтитры', () => {
  const body = '<p>' + 'Митохондрии — энергетические станции клетки, в них образуется АТФ. '.repeat(8) + '</p>';
  it('статья: из <article>, без меню, скриптов, стилей и форм; заголовки и списки', () => {
    const r = articleText(`<html><head><title>Клетка | Сайт</title><style>p{}</style></head><body><header><nav><a>Главная</a><a>Войти</a></nav></header><article><h2>Органоиды</h2>${body}<ul><li>ядро</li><li>рибосомы</li></ul><script>steal()</script><form><input></form></article><aside>Реклама</aside></body></html>`);
    expect(r.title).toBe('Клетка | Сайт');
    expect(r.text).toMatch(/^## Органоиды\n\nМитохондрии/);
    expect(r.text).toContain('- ядро\n- рибосомы');
    expect(r.text).not.toMatch(/steal|Войти|Реклама|p\{\}/);
  });
  it('без <article> — тело страницы; сущности раскодированы; длинный текст обрезан', () => {
    const r = articleText(`<body><div>${body}</div><p>a &amp; b &laquo;в&raquo; &#1046; &#x416;</p></body>`, 300);
    expect(r.cut).toBe(true);
    expect(r.text.length).toBe(300);
    expect(articleText(`<body><div>${body}</div><p>a &amp; b &laquo;в&raquo; &#1046;</p></body>`).text).toContain('a & b «в» Ж');
  });
  it('субтитры XML (srv1) и json3; дорожки YouTube', () => {
    expect(captionsText('<transcript><text start="0" dur="1.5">клетка &amp;amp; ядро</text><text start="1.5" dur="1">делится</text><text start="9" dur="1">[Музыка]</text><text start="12" dur="1">митоз</text></transcript>')).toBe('клетка & ядро делится\n\nмитоз');
    const html = `x"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?a=1","languageCode":"en"},{"baseUrl":"https://www.youtube.com/api/timedtext?a=2","languageCode":"ru","kind":"asr"}],"y"`;
    const t = youtubeTracks(html).tracks;
    expect(t).toHaveLength(2);
    // 1.33: сделанные людьми (любой язык) раньше автоматических — даже на нужном языке.
    expect(pickTrack(t)?.lang).toBe('en');
    expect(pickTrack(t, ['de'])?.lang).toBe('en');
    expect(pickTrack([t[1]])?.lang).toBe('ru');
  });
  it('длинный текст — части по абзацам не длиннее предела', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Абзац ${i}. ` + 'слово '.repeat(150)).join('\n\n');
    const parts = sourceParts(text, 5000);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.every((p) => p.length <= 5000)).toBe(true);
    expect(parts.join('\n\n')).toBe(text);
  });
});

function epub(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries({ mimetype: 'application/epub+zip', ...files }).map(([k, v]) => [k, strToU8(v)])));
}
const long = (s: string) => `<p>${s} ${'Текст главы про клетку и её строение. '.repeat(12)}</p>`;
const BOOK = {
  'META-INF/container.xml': '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'OEBPS/content.opf': `<package><metadata><dc:title>Биология &amp; жизнь</dc:title><dc:creator>Иванов И.</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="cover"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
  'OEBPS/nav.xhtml': '<html><body><nav epub:type="toc"><ol><li><a href="text/ch%201.xhtml">Глава 1. Клетка</a></li><li><a href="text/ch2.xhtml#s">Глава 2. Ткани</a></li></ol></nav></body></html>',
  'OEBPS/text/cover.xhtml': '<html><body><img src="../img/c.jpg"/></body></html>',
  'OEBPS/text/ch 1.xhtml': `<html><body><h1>Клетка</h1>${long('Первая.')}<script>x()</script></body></html>`,
  'OEBPS/text/ch2.xhtml': `<html><body>${long('Вторая.')}</body></html>`
};

describe('книга EPUB', () => {
  it('главы по порядку, названия из оглавления, обложка пропущена', async () => {
    const b = await parseEpub(epub(BOOK));
    expect(b.title).toBe('Биология & жизнь');
    expect(b.author).toBe('Иванов И.');
    expect(b.chapters.map((c) => c.title)).toEqual(['Глава 1. Клетка', 'Глава 2. Ткани']);
    expect(b.chapters[0].text).toMatch(/^## Клетка\n\nПервая\./);
    expect(b.chapters[0].text).not.toContain('x()');
  });
  it('зашифрованные главы (DRM) — понятная ошибка; шрифты зашифрованы — читаем', async () => {
    const drm = '<encryption><EncryptedData><CipherData><CipherReference URI="OEBPS/text/ch2.xhtml"/></CipherData></EncryptedData></encryption>';
    await expect(parseEpub(epub({ ...BOOK, 'META-INF/encryption.xml': drm }))).rejects.toThrow(/DRM/);
    const fonts = drm.replace('OEBPS/text/ch2.xhtml', 'OEBPS/fonts/a.otf');
    expect((await parseEpub(epub({ ...BOOK, 'META-INF/encryption.xml': fonts }))).chapters).toHaveLength(2);
  });
  it('не EPUB и пути внутри архива', async () => {
    await expect(parseEpub(strToU8('просто текст'))).rejects.toThrow(/не книга EPUB/);
    expect(resolvePath('OEBPS/text/a.xhtml', '../img/b%20c.png#x')).toBe('OEBPS/img/b c.png');
    expect(resolvePath('OEBPS/content.opf', '/abs.xhtml')).toBe('abs.xhtml');
  });
});

describe('запрос к ИИ', () => {
  it('Refrain ИИ получает задачу cards.source с текстом части; черновики до 30, повторы отброшены', async () => {
    let sent: Record<string, any> = {};
    vi.stubGlobal('window', {
      mnemaApi: {
        aiAsk: async (r: Record<string, any>) => {
          sent = r;
          return { ok: true, text: JSON.stringify({ cards: Array.from({ length: 35 }, (_, i) => ({ q: `Вопрос ${i}?`, a: `Ответ ${i}`, why: '' })).concat([{ q: 'Уже есть?', a: 'да', why: '' }]) }) };
        }
      }
    });
    const { cardsFromSource } = await import('./sourceCards');
    const d = await cardsFromSource({ title: 'Статья о клетке', text: 'Клетка — основа жизни. '.repeat(20), subject: 'Биология', have: ['Уже есть?'] });
    expect(sent.refrain).toMatchObject({ task: 'cards.source', subject: 'Биология', topic: 'Статья о клетке' });
    expect(sent.refrain.text).toContain('Клетка — основа жизни.');
    expect(sent.system).toContain('статьи, субтитров видео или главы книги');
    expect(d).toHaveLength(30);
    expect(d.some((x) => x.front === 'Уже есть?')).toBe(false);
  });
});
