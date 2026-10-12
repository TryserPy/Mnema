// Мелкие проверки безопасности главного процесса Electron — без самого Electron, чтобы их можно было проверять тестами.
const fs = require('fs');
const path = require('path');

/** Своя страница Refrain: file://…/dist/index.html. Встроенные плееры и любые чужие фреймы — нет. */
function isOwnPage(urlStr) {
  try {
    const u = new URL(String(urlStr || ''));
    return u.protocol === 'file:' && !u.host && u.pathname.endsWith('/dist/index.html');
  } catch {
    return false;
  }
}

/**
 * Решение о разрешении (камера, микрофон…) — одно и для запроса (setPermissionRequestHandler), и для проверки (setPermissionCheckHandler):
 * своей странице — да; встроенным плеерам — только полный экран; остальное — нет.
 */
function permissionAllowed(permission, url) {
  return isOwnPage(url) || permission === 'fullscreen';
}

/** Записать файл с ключами или секретами только для владельца (0600) и закрыть права у уже существующего файла (mode при записи работает только для нового). */
function writePrivate(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* Windows и некоторые файловые системы прав в стиле Unix не знают — там защищает папка профиля */
  }
}

/** Закрыть права у файла, который уже лежит (при запуске: ai.json, secrets.json прежних версий были доступны всем). Нет файла — ничего. */
function lockDown(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* нет файла или права не поддерживаются */
  }
}

/**
 * Как хранятся ключи на этом компьютере. encrypted — настоящее шифрование средствами системы (Windows DPAPI, macOS Keychain,
 * Linux: GNOME Keyring/KWallet). На Linux без хранилища паролей Electron берёт «basic_text» — ключ зашит в самой программе,
 * это почти не защита, и говорить «зашифровано» нельзя.
 */
function keyStorageInfo(safeStorage, platform = process.platform) {
  let available = false;
  let backend = null;
  try {
    available = Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    /* ещё не готов */
  }
  if (platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
    try {
      backend = String(safeStorage.getSelectedStorageBackend());
    } catch {
      /* не определить */
    }
  }
  const weak = backend === 'basic_text' || backend === 'unknown';
  return { encrypted: available && !weak, backend };
}

module.exports = { isOwnPage, permissionAllowed, writePrivate, lockDown, keyStorageInfo };
