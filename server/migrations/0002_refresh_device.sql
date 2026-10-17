-- 1.32: чей был использованный токен обновления. Повтор с того же устройства в окне REFRESH_RETRY_MS — потерянный ответ, а не кража.
-- Старые строки без устройства в окно повтора не попадают (считаются как раньше).
ALTER TABLE refresh_used ADD COLUMN device_id TEXT;

-- 1.32: устройства, с которых открывали панель. Знакомое (подтверждённое «Это я» или вход из Telegram) — без тревоги.
-- hash — HMAC от случайного id, который браузер панели хранит у себя; сам id на сервере не хранится.
CREATE TABLE panel_devices (
  hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  trusted INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE admin_sessions ADD COLUMN device_hash TEXT;
