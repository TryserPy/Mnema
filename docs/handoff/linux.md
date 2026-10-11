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

## Осталось / решения

(дополняется по ходу)
