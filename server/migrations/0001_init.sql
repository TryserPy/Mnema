-- Refrain ИИ 1.31. На сервере только почта и цифры: никаких текстов конспектов, фото и ответов ИИ.
-- IP хранится только HMAC-хэшем (ip_hash) и маской для показа (ip_mask, последний октет скрыт), не дольше 48 часов.

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  grp TEXT NOT NULL DEFAULT 'student',
  created_at INTEGER NOT NULL,
  blocked_until INTEGER,           -- NULL — не заблокирован; 9e15 — до снятия вручную
  block_reason TEXT
);

CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX devices_account ON devices(account_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  refresh_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE UNIQUE INDEX sessions_refresh ON sessions(refresh_hash);

-- Использованные токены обновления: повтор любого из них — кража.
CREATE TABLE refresh_used (
  hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  used_at INTEGER NOT NULL
);

-- Счётчики для лимитов входа и багов (почта, IP, устройство) по окнам.
CREATE TABLE counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE pow_used (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Настройки панели: режим, бюджет, группы, конфиг защиты (JSON).
CREATE TABLE settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE testers (
  email TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  seats INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  grp TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE invite_uses (
  code TEXT NOT NULL,
  account_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (code, account_id)
);

-- Учёт: только цифры.
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  task TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  cached_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_micro INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL
);
CREATE INDEX usage_at ON usage(at);
CREATE INDEX usage_account ON usage(account_id, at);

-- События для окон детектора (48 часов).
CREATE TABLE events (
  at INTEGER NOT NULL,
  account_id TEXT,
  device_id TEXT,
  ip_hash TEXT NOT NULL,
  asn INTEGER,
  country TEXT,
  lat REAL,
  lon REAL,
  task TEXT,
  kind TEXT NOT NULL               -- task | signup | auth_fail
);
CREATE INDEX events_account ON events(account_id, at);
CREATE INDEX events_ip ON events(ip_hash, at);

CREATE TABLE scores (
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  score REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, subject)
);

-- Блоки (уровень 2) и замедления (уровень 1).
CREATE TABLE blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- account | device | ip | asn
  subject TEXT NOT NULL,
  label TEXT NOT NULL,
  asn INTEGER,                     -- для блоков IP: чтобы заметить несколько блоков в одном ASN
  account_id TEXT,                 -- для блоков устройства и ожидающих подтверждения
  level INTEGER NOT NULL,          -- 1 замедление, 2 блок
  reason TEXT NOT NULL,
  rules TEXT NOT NULL,             -- JSON
  since INTEGER NOT NULL,
  until INTEGER,                   -- NULL — до снятия
  pending INTEGER NOT NULL DEFAULT 0,
  lifted_at INTEGER
);
CREATE INDEX blocks_subject ON blocks(kind, subject);

CREATE TABLE journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_kind TEXT,
  target_id TEXT,
  reason TEXT,
  rules TEXT,
  score REAL,
  before TEXT,
  after TEXT
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  rules TEXT,
  who TEXT,
  done TEXT NOT NULL,
  buttons TEXT NOT NULL,
  group_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  read_at INTEGER,
  tg_status TEXT NOT NULL DEFAULT 'pending',
  tg_attempts INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'none',
  next_try_at INTEGER,
  tg_message_id INTEGER
);
CREATE INDEX alerts_group ON alerts(group_key, at);
CREATE INDEX alerts_delivery ON alerts(tg_status, next_try_at);

-- Баги: текст 90 дней, без почт и снимков экрана.
CREATE TABLE bugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  app TEXT NOT NULL,
  log TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  github_issue INTEGER,
  sender TEXT NOT NULL             -- хэш IP: для «Спам · блок»
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  via TEXT NOT NULL
);
