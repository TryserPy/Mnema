// Refrain на Linux: автозапуск, закрытие окна без значка у часов, способ обновления, выбор файла из выпуска, файлы из командной строки.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const linux = req('../electron/linux.cjs');
const openFiles = req('../electron/openFiles.cjs');

describe('автозапуск при входе (~/.config/autostart/refrain.desktop)', () => {
  it('пишет Exec с ключом --hidden и без перевода строки в значениях', () => {
    const t: string = linux.autostartEntry({ exec: '/opt/Refrain/refrain' });
    expect(t).toContain('[Desktop Entry]');
    expect(t).toContain('Exec=/opt/Refrain/refrain --hidden\n');
    expect(t).toContain('Type=Application');
    expect(t).toContain('X-GNOME-Autostart-enabled=true');
    expect(t.endsWith('\n')).toBe(true);
  });
  it('берёт путь AppImage, а не временный путь внутри образа', () => {
    expect(linux.autostartCommand({ APPIMAGE: '/home/me/Apps/Refrain-1.28.0-x86_64.AppImage' }, '/tmp/.mount_RefrXYZ/refrain')).toBe('/home/me/Apps/Refrain-1.28.0-x86_64.AppImage');
    expect(linux.autostartCommand({}, '/opt/Refrain/refrain')).toBe('/opt/Refrain/refrain');
    expect(linux.autostartCommand({ APPIMAGE: 'относительный/путь' }, '/opt/Refrain/refrain')).toBe('/opt/Refrain/refrain');
  });
  it('путь с пробелами и спецсимволами берёт в кавычки', () => {
    const t: string = linux.autostartEntry({ exec: '/home/me/My Apps/Refrain $1.AppImage' });
    expect(t).toContain('Exec="/home/me/My Apps/Refrain \\$1.AppImage" --hidden\n');
    expect(linux.desktopExecQuote('50%')).toBe('50%%');
  });
  it('название с переводом строки не даёт дописать свой ключ', () => {
    const t: string = linux.autostartEntry({ exec: '/x', name: 'Refrain\nExec=/bin/evil' });
    expect(t.split('\n').filter((l) => l.startsWith('Exec='))).toEqual(['Exec=/x --hidden']);
  });
  it('файл лежит в XDG_CONFIG_HOME или ~/.config', () => {
    expect(linux.autostartFile({ XDG_CONFIG_HOME: '/home/me/.cfg' }, '/home/me')).toBe('/home/me/.cfg/autostart/refrain.desktop');
    expect(linux.autostartFile({}, '/home/me')).toBe('/home/me/.config/autostart/refrain.desktop');
    expect(linux.autostartFile({ XDG_CONFIG_HOME: 'не-абсолютный' }, '/home/me')).toBe('/home/me/.config/autostart/refrain.desktop');
  });
});

describe('закрытие окна: что делать, если значка у часов нет', () => {
  const base = { platform: 'linux', trayEnabled: true, closeToTray: true, quitting: false, trayHost: true };
  it('значок есть — прячем к нему', () => expect(linux.closeAction(base)).toBe('hide'));
  it('значка нет (GNOME без AppIndicator) — сворачиваем, а не прячем навсегда', () => expect(linux.closeAction({ ...base, trayHost: false })).toBe('minimize'));
  it('«оставаться у часов» выключено или значок выключен — обычное закрытие', () => {
    expect(linux.closeAction({ ...base, closeToTray: false })).toBe('close');
    expect(linux.closeAction({ ...base, trayEnabled: false, trayHost: false })).toBe('close');
  });
  it('при выходе из меню окно закрывается', () => expect(linux.closeAction({ ...base, quitting: true })).toBe('close'));
  it('на Windows поведение прежнее', () => {
    expect(linux.closeAction({ ...base, platform: 'win32', trayHost: false })).toBe('hide');
    expect(linux.closeAction({ ...base, platform: 'win32', closeToTray: false })).toBe('close');
  });
});

describe('есть ли в системе место для значка', () => {
  it('разбирает ответ gdbus и dbus-send', () => {
    expect(linux.parseNameHasOwner('(true,)\n')).toBe(true);
    expect(linux.parseNameHasOwner('(false,)\n')).toBe(false);
    expect(linux.parseNameHasOwner('method return time=1 sender=:1.2 -> destination=:1.9 serial=3 reply_serial=2\n   boolean true\n')).toBe(true);
    expect(linux.parseNameHasOwner('')).toBeNull();
    expect(linux.parseNameHasOwner('что-то другое')).toBeNull();
  });
  it('если спросить не вышло: GNOME — нет значка, остальные оболочки — есть', () => {
    expect(linux.guessTrayHost({ XDG_CURRENT_DESKTOP: 'GNOME' })).toBe(false);
    expect(linux.guessTrayHost({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' })).toBe(false);
    expect(linux.guessTrayHost({ XDG_CURRENT_DESKTOP: 'KDE' })).toBe(true);
    expect(linux.guessTrayHost({ XDG_CURRENT_DESKTOP: 'XFCE' })).toBe(true);
    expect(linux.guessTrayHost({ XDG_CURRENT_DESKTOP: 'X-Cinnamon' })).toBe(true);
    expect(linux.guessTrayHost({})).toBe(true);
  });
});

describe('флаги Chromium для Linux', () => {
  it('всегда просит Wayland/X11 по обстановке, портал горячих клавиш — только под Wayland', () => {
    expect(linux.chromiumFlags({}, [])).toEqual([['ozone-platform-hint', 'auto']]);
    expect(linux.chromiumFlags({ XDG_SESSION_TYPE: 'wayland' }, [])).toEqual([
      ['ozone-platform-hint', 'auto'],
      ['enable-features', 'GlobalShortcutsPortal']
    ]);
    expect(linux.chromiumFlags({ WAYLAND_DISPLAY: 'wayland-0' }, []).length).toBe(2);
  });
  it('не мешает, если платформу выбрали вручную', () => {
    expect(linux.chromiumFlags({}, ['refrain', '--ozone-platform=x11'])).toEqual([]);
  });
});

describe('способ обновления', () => {
  it('AppImage обновляется сама, пакет и архив — только ссылка', () => {
    expect(linux.updateMode({ platform: 'linux', env: { APPIMAGE: '/home/me/Refrain.AppImage' } })).toBe('auto');
    expect(linux.updateMode({ platform: 'linux', env: {} })).toBe('manual');
    expect(linux.updateMode({ platform: 'win32', env: {} })).toBe('auto');
  });
});

describe('какой файл выпуска предложить скачать', () => {
  const V = '1.30.0';
  const url = (n: string) => `https://example.org/${n}`;
  const assets = [
    `Refrain-Setup-${V}.exe`,
    `Refrain-${V}-Android.apk`,
    `Refrain-${V}-x86_64.AppImage`,
    `Refrain-${V}-arm64.AppImage`,
    `Refrain_${V}_amd64.deb`,
    `Refrain_${V}_arm64.deb`,
    `Refrain-${V}-x64.tar.gz`,
    `Refrain-${V}-arm64.tar.gz`,
    'latest-linux.yml'
  ].map((name) => ({ name, browser_download_url: url(name), size: 1000 }));
  it('для .deb — свой пакет под архитектуру', () => {
    expect(linux.pickLinuxAsset(assets, { arch: 'x64', packageType: 'deb' }).name).toBe(`Refrain_${V}_amd64.deb`);
    expect(linux.pickLinuxAsset(assets, { arch: 'arm64', packageType: 'deb' }).name).toBe(`Refrain_${V}_arm64.deb`);
  });
  it('без пакета (AppImage или архив) — AppImage, потом архив', () => {
    expect(linux.pickLinuxAsset(assets, { arch: 'x64', packageType: '' }).name).toBe(`Refrain-${V}-x86_64.AppImage`);
    expect(linux.pickLinuxAsset(assets, { arch: 'arm64', packageType: '' }).name).toBe(`Refrain-${V}-arm64.AppImage`);
    expect(linux.pickLinuxAsset(assets.filter((a) => !/AppImage/.test(a.name)), { arch: 'x64', packageType: '' }).name).toBe(`Refrain-${V}-x64.tar.gz`);
  });
  it('rpm в выпуске нет — предлагаем AppImage; ничего подходящего — null', () => {
    expect(linux.pickLinuxAsset(assets, { arch: 'x64', packageType: 'rpm' }).name).toBe(`Refrain-${V}-x86_64.AppImage`);
    expect(linux.pickLinuxAsset([], { arch: 'x64', packageType: 'deb' })).toBeNull();
    expect(linux.pickLinuxAsset(undefined, { arch: 'x64', packageType: 'deb' })).toBeNull();
  });
  it('ответ GitHub → данные для окна обновления', () => {
    const info = linux.manualUpdateInfo({ tag_name: `v${V}`, body: 'Что нового <b>тут</b>', assets }, { current: '1.28.0', arch: 'x64', packageType: 'deb', fallbackUrl: 'https://example.org/releases' });
    expect(info).toMatchObject({ ok: true, latest: V, available: true, manual: true, url: url(`Refrain_${V}_amd64.deb`), fileName: `Refrain_${V}_amd64.deb`, notes: 'Что нового тут' });
    const same = linux.manualUpdateInfo({ tag_name: 'v1.28.0', assets }, { current: '1.28.0', arch: 'x64', packageType: '', fallbackUrl: 'https://example.org/releases' });
    expect(same.available).toBe(false);
    const none = linux.manualUpdateInfo({ tag_name: 'v2.0.0', assets: [] }, { current: '1.28.0', arch: 'x64', packageType: 'deb', fallbackUrl: 'https://example.org/releases' });
    expect(none.url).toBe('https://example.org/releases');
    expect(linux.manualUpdateInfo({}, { current: '1', arch: 'x64', packageType: '', fallbackUrl: '' }).ok).toBe(false);
  });
  it('сравнивает версии по числам', () => {
    expect(linux.isNewer('1.10.0', '1.9.3')).toBe(true);
    expect(linux.isNewer('v1.28.0', '1.28.0')).toBe(false);
  });
});

describe('файлы Refrain из командной строки', () => {
  it('берёт только .mnema, .refrainstyle и .mnemamod, пути и ссылки file://', () => {
    const argv = ['/opt/Refrain/refrain', '--hidden', '/home/me/Тема.mnema', 'file:///home/me/%D0%A1%D1%82%D0%B8%D0%BB%D1%8C.refrainstyle', 'старый.MNEMAMOD', '/home/me/колода.apkg', '--flag=/x.mnema'];
    expect(openFiles.filesFromArgv(argv, '/work')).toEqual(['/home/me/Тема.mnema', '/home/me/Стиль.refrainstyle', '/work/старый.MNEMAMOD']);
  });
  it('не повторяет файл и ограничивает число', () => {
    expect(openFiles.filesFromArgv(['x', '/a.mnema', '/a.mnema'], '/')).toEqual(['/a.mnema']);
    expect(openFiles.filesFromArgv(['x', ...Array.from({ length: 30 }, (_, i) => `/f${i}.mnema`)], '/').length).toBe(10);
    expect(openFiles.filesFromArgv(undefined, '/')).toEqual([]);
  });
  it('расширения совпадают с теми, что записаны для установщика', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const ext = pkg.build.linux.fileAssociations.map((a: { ext: string }) => '.' + a.ext).sort();
    expect([...openFiles.EXTS].sort()).toEqual(ext);
  });
});

describe('сборка для Linux (package.json)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const l = pkg.build.linux;
  it('есть AppImage, deb и архив, категория «Education», значки', () => {
    expect(l.target.map((t: { target: string }) => t.target).sort()).toEqual(['AppImage', 'deb', 'tar.gz']);
    expect(l.category).toBe('Education');
    expect(l.icon).toBe('build/icons');
  });
  it('имена файлов выпуска: Refrain-<версия>-x86_64.AppImage и Refrain_<версия>_amd64.deb', () => {
    expect(pkg.build.appImage.artifactName).toBe('Refrain-${version}-${arch}.AppImage');
    expect(pkg.build.deb.artifactName).toBe('Refrain_${version}_${arch}.deb');
  });
  it('окно связывается с .desktop-файлом: desktopName и StartupWMClass совпадают', () => {
    expect(pkg.desktopName).toBe('refrain.desktop');
    expect(l.syncDesktopName).toBe(true);
    expect(l.desktop.entry.StartupWMClass).toBe('refrain');
  });
  it('у файлов Refrain есть mime-типы, а в установщике Windows ассоциаций не прибавилось', () => {
    for (const a of l.fileAssociations) expect(a.mimeType).toMatch(/^application\/x-(refrain|mnema)-/);
    expect(pkg.build.fileAssociations).toBeUndefined();
  });
});
