// Свои значки-картинки: проверка чужих данных, кадрирование, укладывание в лимит, сохранение при копировании, слиянии и обмене.
import { describe, expect, it } from 'vitest';
import { copyFolder, copySubject } from './copy';
import { cleanIconImg, cleanIconImgs, cropRect, dataUriBytes, fitIcon, ICON_MAX_BYTES, validIconImg } from './iconImage';
import { importTopicPackage } from './share';
import { emptyData, getData, normalizeData } from './store';
import { mergeData } from './sync';
import type { AppData } from './types';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const WEBP = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const bytesUri = (mime: string, bytes: number[], pad = 0) => `data:image/${mime};base64,` + Buffer.from([...bytes, ...new Array(pad).fill(0)]).toString('base64');
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = bytesUri('jpeg', [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';

describe('проверка значка-картинки из чужих данных', () => {
  it('принимает настоящие png, webp, gif, jpeg', () => {
    for (const u of [PNG, WEBP, GIF, JPEG]) expect(validIconImg(u)).toBe(true);
  });
  it('отвергает SVG в любом виде', () => {
    expect(validIconImg('data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64'))).toBe(false);
    expect(validIconImg('data:image/svg+xml;utf8,' + encodeURIComponent(SVG))).toBe(false);
    // SVG, выданный за png или webp: первые байты не те
    expect(validIconImg('data:image/png;base64,' + Buffer.from(SVG).toString('base64'))).toBe(false);
    expect(validIconImg('data:image/webp;base64,' + Buffer.from(SVG).toString('base64'))).toBe(false);
  });
  it('отвергает адреса, скрипты и не строки', () => {
    for (const x of ['https://evil/x.png', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd', '', 'data:image/png;base64,', 5, null, undefined, {}, [PNG]]) expect(validIconImg(x)).toBe(false);
  });
  it('отвергает подмену внутри строки (кавычки, пробелы, обрезанный хвост)', () => {
    expect(validIconImg(PNG + '"onerror="x')).toBe(false);
    expect(validIconImg(PNG + ' ')).toBe(false);
    expect(validIconImg(PNG.replace('base64,', 'base64,%'))).toBe(false);
    expect(validIconImg(PNG.slice(0, -2))).toBe(false); // длина base64 не кратна 4
  });
  it('отвергает слишком тяжёлое', () => {
    const big = bytesUri('png', PNG_HEAD, ICON_MAX_BYTES);
    expect(dataUriBytes(big)).toBeGreaterThan(ICON_MAX_BYTES);
    expect(validIconImg(big)).toBe(false);
    const edge = bytesUri('png', PNG_HEAD, ICON_MAX_BYTES - 8);
    expect(dataUriBytes(edge)).toBe(ICON_MAX_BYTES);
    expect(validIconImg(edge)).toBe(true);
    expect(validIconImg('data:image/png;base64,' + 'A'.repeat(5_000_000))).toBe(false);
  });
  it('cleanIconImg и cleanIconImgs', () => {
    expect(cleanIconImg(PNG)).toBe(PNG);
    expect(cleanIconImg('x')).toBeUndefined();
    const ok = [{ id: 'a', iconImg: PNG }, { id: 'b' }];
    expect(cleanIconImgs(ok)).toBe(ok); // менять нечего — тот же массив
    const mixed = cleanIconImgs([{ id: 'a', iconImg: PNG }, { id: 'b', iconImg: 'https://evil/x.png' }, { id: 'c', iconImg: 7 as unknown as string }]);
    expect(mixed.map((x) => x.iconImg)).toEqual([PNG, undefined, undefined]);
    expect('iconImg' in mixed[1]).toBe(false);
  });
});

describe('кадрирование до квадрата', () => {
  it('по умолчанию — самый большой квадрат по центру', () => {
    expect(cropRect(200, 100, { zoom: 1, cx: 0.5, cy: 0.5 })).toEqual({ sx: 50, sy: 0, side: 100 });
    expect(cropRect(100, 200, { zoom: 1, cx: 0.5, cy: 0.5 })).toEqual({ sx: 0, sy: 50, side: 100 });
  });
  it('приближение уменьшает квадрат, центр можно сдвигать, но за край картинки не выйти', () => {
    expect(cropRect(100, 100, { zoom: 2, cx: 0.5, cy: 0.5 })).toEqual({ sx: 25, sy: 25, side: 50 });
    expect(cropRect(100, 100, { zoom: 2, cx: 0, cy: 1 })).toEqual({ sx: 0, sy: 50, side: 50 });
    expect(cropRect(100, 100, { zoom: 2, cx: 5, cy: -3 })).toEqual({ sx: 50, sy: 0, side: 50 });
  });
  it('кривые числа не ломают расчёт', () => {
    const r = cropRect(100, 80, { zoom: NaN, cx: NaN, cy: Infinity });
    expect(r.side).toBe(80);
    expect(Number.isFinite(r.sx) && Number.isFinite(r.sy)).toBe(true);
    expect(cropRect(100, 100, { zoom: 100, cx: 0.5, cy: 0.5 }).side).toBe(12.5); // не больше 8×
  });
});

describe('укладывание в лимит', () => {
  const fat = 'data:image/webp;base64,' + Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...new Array(ICON_MAX_BYTES + 100).fill(1)]).toString('base64');
  it('берёт первый вариант, который влез', () => {
    const calls: string[] = [];
    const r = fitIcon((side, mime, q) => (calls.push(`${side}/${mime}/${q}`), q <= 0.8 ? WEBP : fat));
    expect(r).toBe(WEBP);
    expect(calls[0]).toBe('128/image/webp/0.92');
    expect(calls).toHaveLength(2);
  });
  it('браузер без WebP отдаёт PNG: пробуем PNG и, если тяжело, уменьшаем сторону', () => {
    const fatPng = bytesUri('png', PNG_HEAD, ICON_MAX_BYTES);
    const r = fitIcon((side, mime) => (mime === 'image/webp' ? fatPng : side === 128 ? fatPng : PNG));
    expect(r).toBe(PNG);
  });
  it('не влезло ни в каком виде — null', () => {
    expect(fitIcon(() => fat)).toBeNull();
  });
});

describe('значок-картинка в данных', () => {
  const world = (): AppData => {
    const d = emptyData();
    d.folders = [{ id: 'f1', name: 'Папка', color: '#0a0', icon: '📁', iconImg: PNG, createdAt: '2026-01-01T00:00:00Z' }];
    d.subjects = [
      { id: 's1', name: 'Один', color: '#0a0', icon: '🧪', iconImg: WEBP, folderId: 'f1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 's2', name: 'Два', color: '#00a', iconImg: 'https://evil/x.png', createdAt: '2026-01-01T00:00:00Z' }
    ];
    return d;
  };
  const clone = (d: AppData): AppData => normalizeData(JSON.parse(JSON.stringify(d)));

  it('при загрузке чужих данных негодные картинки выбрасываются, годные остаются, эмодзи остаётся', () => {
    const n = clone(world());
    expect(n.folders[0].iconImg).toBe(PNG);
    expect(n.subjects[0].iconImg).toBe(WEBP);
    expect(n.subjects[0].icon).toBe('🧪');
    expect(n.subjects[1].iconImg).toBeUndefined();
    expect('iconImg' in n.subjects[1]).toBe(false);
  });
  it('в корзине негодная картинка тоже выбрасывается', () => {
    const d = world();
    d.trash = [{ id: 'x', at: '2026-01-01T00:00:00Z', label: 'Предмет', removed: { subjects: d.subjects, topics: [], cards: [], logs: [], marks: [], states: {} } }];
    const n = clone(d);
    expect(n.trash![0].removed.subjects.map((s) => s.iconImg)).toEqual([WEBP, undefined]);
  });
  it('копия предмета и папки сохраняет картинку', () => {
    let k = 0;
    const uid = () => 'u' + ++k;
    const d = clone(world());
    const cs = copySubject(d, 's1', uid, '2026-02-01T00:00:00Z')!;
    expect(cs.data.subjects.find((s) => s.id === cs.id)!.iconImg).toBe(WEBP);
    const cf = copyFolder(d, 'f1', uid, '2026-02-01T00:00:00Z')!;
    expect(cf.data.folders.find((f) => f.id === cf.id)!.iconImg).toBe(PNG);
    expect(cf.data.subjects.filter((s) => s.folderId === cf.id)[0].iconImg).toBe(WEBP);
  });
  it('синхронизация: побеждает более новая версия, в том числе «картинку убрали»', () => {
    const a = clone(world());
    const b = clone(world());
    b.subjects[0] = { ...b.subjects[0], iconImg: undefined, updatedAt: '2026-03-01T00:00:00Z' };
    expect(mergeData(a, b).data.subjects.find((s) => s.id === 's1')!.iconImg).toBeUndefined();
    const c = clone(world());
    c.subjects[0] = { ...c.subjects[0], iconImg: PNG, updatedAt: '2026-03-02T00:00:00Z' };
    expect(mergeData(a, c).data.subjects.find((s) => s.id === 's1')!.iconImg).toBe(PNG);
  });
  it('файл темы: значок предмета переносится, подложная картинка отбрасывается', () => {
    const pkg = (img: string, name: string) => ({
      kind: 'mnema-topic' as const,
      version: 1 as const,
      exportedAt: '2026-01-01T00:00:00Z',
      subject: { name, color: '#123456', icon: '🧬', iconImg: img },
      topic: { name: 'Тема', note: 'Текст' },
      cards: []
    });
    importTopicPackage(pkg(WEBP, 'Из файла 1'));
    importTopicPackage(pkg('data:image/svg+xml;base64,' + Buffer.from(SVG).toString('base64'), 'Из файла 2'));
    const subs = getData().subjects;
    const s1 = subs.find((s) => s.name === 'Из файла 1')!;
    const s2 = subs.find((s) => s.name === 'Из файла 2')!;
    expect(s1.iconImg).toBe(WEBP);
    expect(s1.icon).toBe('🧬');
    expect(s2.iconImg).toBeUndefined();
    expect(s2.icon).toBe('🧬');
  });
});
