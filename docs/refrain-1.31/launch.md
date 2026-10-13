# Refrain ИИ — запуск сервера

Делает только владелец. Секреты задаются командой `wrangler secret put <ИМЯ>` (она спрашивает значение сама) и нигде больше не записываются: ни в репозиторий, ни в чат, ни в заметки.

## Порядок выкладки

1. **Сервер** (этот документ) — режим доступа на старте «Тестировщики».
2. **Приложение 1.31.0** — выпуск как обычно.
3. **Открыть для всех** — в панели: Доступ → «Все» (с PIN). Новая версия приложения для этого не нужна.

## 1. OpenAI (обязательно до запуска)

1. В кабинете OpenAI создай **отдельный проект** «Refrain».
2. В настройках проекта ограничь модели: разрешена **одна** — `gpt-6-luna`.
3. Поставь **потолок расходов проекта** (например, $25 при бюджете $20 в панели). Это последний предохранитель на случай ошибки в сервере.
4. Создай в проекте ключ → `wrangler secret put OPENAI_API_KEY`.
5. Узнай id проекта (`proj_…`) → `wrangler secret put OPENAI_PROJECT_ID`.
6. Для сверки расхода (поиск утечки ключа) создай **админ-ключ организации** (Organization settings → Admin keys). Если доступен вариант только на чтение — выбери его. → `wrangler secret put OPENAI_ADMIN_KEY`. Рабочий ключ проекта эти данные не читает. Без админ-ключа сверка просто молчит, всё остальное работает.

## 2. Cloudflare

```bash
cd server
npm ci
npx wrangler login
npx wrangler d1 create refrain          # вписать database_id в wrangler.toml
npx wrangler d1 migrations apply refrain --remote
```

Для выкладки из GitHub Actions: в настройках репозитория → Secrets → `CLOUDFLARE_API_TOKEN` (права Workers Scripts:Edit, D1:Edit) и `CLOUDFLARE_ACCOUNT_ID`. Выкладка: Actions → «Сервер Refrain ИИ» → Run workflow → deploy.

## 3. Секреты сервера

| Секрет | Что это | Как получить |
| --- | --- | --- |
| `OPENAI_API_KEY` | ключ проекта Refrain | шаг 1.4 |
| `OPENAI_PROJECT_ID` | id проекта | шаг 1.5 |
| `OPENAI_ADMIN_KEY` | админ-ключ для Usage API | шаг 1.6 |
| `TOKEN_SECRET` | ключ подписи токенов, кодов, PoW | `openssl rand -base64 48` |
| `OWNER_EMAIL` | твоя почта: ты — группа «Ты», сюда же коды панели и резервные тревоги | |
| `OWNER_TELEGRAM_ID` | твой Telegram ID | написать боту @userinfobot |
| `TELEGRAM_BOT_TOKEN` | токен бота | @BotFather → /newbot |
| `TELEGRAM_WEBHOOK_SECRET` | секрет вебхука | `openssl rand -hex 32` |
| `ADMIN_PIN_HASH` | хэш PIN панели | `node scripts/pin-hash.mjs` (PIN спросит сам) |
| `BREVO_API_KEY` | ключ Brevo для писем с кодами | brevo.com → SMTP & API → API keys |
| `MAIL_FROM` | адрес отправителя, подтверждённый в Brevo | |
| `GITHUB_ISSUE_TOKEN` | fine-grained токен: только `TryserPy/Mnema`, Issues: Read and write | GitHub → Developer settings |

`TOKEN_SECRET` после запуска не меняй без нужды: смена разлогинит всех учеников.

## 4. Telegram

1. @BotFather → /newbot → токен в `TELEGRAM_BOT_TOKEN`.
2. @BotFather → Bot Settings → Menu Button → адрес мини-приложения `https://tryserpy.github.io/Mnema-site/tg/`.
3. Вебхук (один раз, после выкладки):
   ```bash
   curl -sS "https://api.telegram.org/bot<токен>/setWebhook" \
     -d url="https://refrain-ai.<аккаунт>.workers.dev/v1/tg/webhook" \
     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" -d allowed_updates='["message"]'
   ```
   Токен в команде набери вручную в своём терминале.
4. Напиши боту `/status` — он должен ответить.

## 5. Проверка после выкладки

- Панель: открыть мини-приложение из бота → вход приходит сообщением в чат.
- Приложение: Настройки → ИИ → Refrain ИИ → вход по почте → конспект страницы.
- Тревога: в панели «Пауза» → «Вернуть режим» — оба действия видны в журнале.

## Если ключ OpenAI мог утечь

Сервер сам включит аварийную паузу (Refrain ИИ работает только у тебя) и пришлёт 🚨-тревогу. Отозвать ключ он не может.

1. В проекте OpenAI создай новый ключ.
2. `wrangler secret put OPENAI_API_KEY` — вставь новый.
3. В кабинете OpenAI отзови старый ключ.
4. В панели: «Ключ заменён» (PIN) → «Вернуть режим».
