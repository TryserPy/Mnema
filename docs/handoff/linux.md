# Refrain для Linux — заметка передачи

Ветка: `claude/nice-cerf-hsheob-linux` (worktree «Sonnet»). Работа поверх `claude/nice-cerf-hsheob`.

## Сделано

1. **Сборка** (`package.json`): цели `AppImage` (x64, arm64), `deb` (x64, arm64), `tar.gz` (x64, arm64); значки `build/icons/NNxNN.png`
   (получаются из `build/icon.png` командой `npm run icons:linux`, нужен ImageMagick); категория Education; `desktopName: refrain.desktop` +
   `linux.syncDesktopName` + `StartupWMClass=refrain` (окно связывается с .desktop-файлом и на X11, и на Wayland); имя исполняемого файла `refrain`,
   пакет `refrain`; mime-типы `application/x-refrain-topic` (.mnema), `application/x-refrain-style` (.refrainstyle), `application/x-mnema-style` (.mnemamod)
   — заданы в `build.linux.fileAssociations`, а не на верхнем уровне, чтобы установщик Windows не получил новых ассоциаций (там их не было).
   Скрипты: `npm run dist:linux` (x64), `npm run dist:linux:arm64`.
2. **Код под Linux** (`electron/linux.cjs` — чистая логика + системные вызовы, тесты `src/linux.test.ts`):
   - автозапуск: `~/.config/autostart/refrain.desktop` (для AppImage — путь из `$APPIMAGE`), вызывается из `tray.cjs` вместо `setLoginItemSettings`;
   - значок у часов: проверка через D-Bus (`org.kde.StatusNotifierWatcher`, gdbus/dbus-send, иначе догадка по `XDG_CURRENT_DESKTOP`); если значка нет —
     «оставаться у часов» превращается в сворачивание окна (`tray.hideWindow`), скрытый автозапуск показывает окно;
   - флаги Chromium: `ozone-platform-hint=auto`, под Wayland ещё `enable-features=GlobalShortcutsPortal`;
   - уведомления: значок передаётся явно (`notify.cjs`);
   - обновление: AppImage — electron-updater (`latest-linux.yml`), .deb и архив — только сообщение и ссылка на нужный файл выпуска
     (`updater.cjs`, `UpdateFlow.tsx`, поля `manual/url/fileName` в `UpdateInfo`);
   - открытие файлов двойным щелчком: `electron/openFiles.cjs` (аргументы запуска и `second-instance`), `window.mnemaApi.onOpenFile`, `src/openFile.ts`, хук в `App.tsx`.
3. **Тексты**: «Windows и Android» → «Windows, Linux и Android», подписи автозапуска/уведомлений/значка зависят от платформы.

4. **CI** (`.github/workflows/release.yml`): job `linux` (ubuntu-latest) собирает `AppImage deb tar.gz` для x64 и arm64, проверяет набор файлов
   (`Refrain-<v>-x86_64.AppImage`, `Refrain-<v>-arm64.AppImage`, `Refrain_<v>_amd64.deb`, `Refrain_<v>_arm64.deb`, `Refrain-<v>-x64.tar.gz`,
   `Refrain-<v>-arm64.tar.gz`, `latest-linux.yml`, `latest-linux-arm64.yml`) и кладёт в артефакт `linux`; job `release` ждёт его и выкладывает вместе с остальными.
   `ci.yml` не менялся: сборка пакетов тянет Electron (~100 МБ) на каждый пуш — только при выпуске.
5. **Папка данных**: `electron/dataLayout.cjs` уже даёт на Linux `~/.config/Refrain/{Мои данные,Служебное}` (appData = XDG_CONFIG_HOME). Правка: `ПРОЧТИ.txt`
   без «Windows» и без `\` на Linux (`readmeText(layout, platform)`), тесты в `src/linux.test.ts`.
6. В ветку влит `claude/nice-cerf-hsheob` (c91efda); из репозитория убрана случайно закоммиченная ссылка `node_modules` (коммит 2cdc3ee чужой), `.gitignore`: `node_modules` без слэша.

## Проверено здесь (Linux x64, xvfb + Playwright `_electron`, Ubuntu 24.04)

- `electron-builder --linux AppImage deb tar.gz --x64 --arm64`: все 6 пакетов + `latest-linux.yml`, `latest-linux-arm64.yml` (AppImage ≈155 МБ, deb ≈123 МБ, tar.gz ≈148 МБ).
- `.deb` поставлен `apt-get install ./…deb`: `/opt/Refrain`, `/usr/bin/refrain`, `refrain.desktop` (Education, Keywords/Comment ru+en, MimeType), значки hicolor 16…1024, mime-типы зарегистрированы (`/usr/share/mime/globs2`).
- Запуск из .deb и из AppImage (`APPIMAGE_EXTRACT_AND_RUN=1`): окно «Refrain», WM_CLASS = `refrain`/`refrain` (совпадает с StartupWMClass), данные в `~/.config/Refrain/…`.
- Открытие `.mnema` аргументом запуска и вторым запуском (second-instance), `.refrainstyle` — через `file://`; автозапуск пишет/удаляет `~/.config/autostart/refrain.desktop`; OCR (rus+eng) из упакованного приложения работает (≈0,5 с); `Notification.isSupported()` = true.
- Не проверено (нет рабочего стола): настоящий значок в трее (SNI), уведомления на экране, Wayland и HiDPI, `GlobalShortcutsPortal`, сворачивание окна (в Xvfb нет оконного менеджера), arm64-пакеты (собраны, не запущены), самообновление AppImage (нужен реальный выпуск с `latest-linux.yml`).

## Решения и что осталось

- AppImage собран штатным (legacy) набором electron-builder: он требует `libfuse2` на старых/новых Ubuntu и сам добавляет `--no-sandbox` в `.desktop` AppImage. Статический рантайм (`toolsets.appimage: 1.0.x`) в бете — не включали.
  `.deb` ставит AppArmor-профиль и `chrome-sandbox` с нужными правами (postinst), `--no-sandbox` не нужен.
- `.rpm` не собираем (нужен `rpmbuild` на runner'е); Fedora/Arch — AppImage или tar.gz. Добавить: `sudo apt-get install -y rpm` и цель `rpm` в `build.linux.target`.
- Значки: `build/icons/*.png` — копии `build/icon.png`; после смены логотипа выполнить `npm run icons:linux` (нужен ImageMagick) и закоммитить.
- `src/textbook.ts` и `src/components/TextbookImport.tsx` («работает в приложении для Windows») не трогал — область «textbook»; там стоит дописать «и Linux».
- `npx` в этом окружении один раз вернул код 216 без вывода — собирать можно `node node_modules/electron-builder/cli.js …`.
