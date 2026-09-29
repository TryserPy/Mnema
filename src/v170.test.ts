import { describe, expect, it } from 'vitest';
import { readRelease, UPDATE_REPO } from './update';

describe('1.7: обновления из выпусков GitHub', () => {
  const rel = {
    tag_name: 'v1.7.0',
    body: '  Новое: окно обновления  ',
    assets: [
      { name: 'latest.yml', browser_download_url: 'https://github.com/x/latest.yml', size: 300 },
      { name: 'Mnema-Setup-1.7.0.exe', browser_download_url: 'https://github.com/x/setup.exe', size: 90e6 },
      { name: 'Mnema-1.7.0-Android.apk', browser_download_url: 'https://github.com/x/m.apk', size: 13e6 }
    ]
  };

  it('находит APK для телефона и понимает, что версия новее', () => {
    const r = readRelease(rel, '1.6.4');
    expect(r).toMatchObject({ ok: true, latest: '1.7.0', available: true, apk: 'https://github.com/x/m.apk', size: 13e6, notes: 'Новое: окно обновления' });
  });

  it('та же или старая версия — обновления нет', () => {
    expect(readRelease(rel, '1.7.0').available).toBe(false);
    expect(readRelease({ ...rel, tag_name: 'v1.6.9' }, '1.7.0').available).toBe(false);
  });

  it('выпуск без APK — ссылки нет', () => {
    expect(readRelease({ tag_name: 'v2.0.0', assets: [] }, '1.7.0').apk).toBeUndefined();
  });

  it('репозиторий зашит в код', () => {
    expect(UPDATE_REPO).toEqual({ owner: 'TryserPy', repo: 'Mnema' });
  });
});
