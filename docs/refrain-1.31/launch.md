# Refrain ИИ 1.31 — запуск (пошагово, со ссылками)

Делает только владелец. Секреты вводятся командой `npx wrangler secret put <ИМЯ>` (она сама спрашивает значение) и больше нигде не записываются: ни в репозиторий, ни в чат, ни в заметки.
Все команды — в терминале, в папке `server` репозитория Mnema (ветка `claude/wizardly-volta-879gpb`). На Windows — PowerShell или Git Bash.

## 0. Что понадобится

- Node.js 22 — https://nodejs.org (LTS). Проверка: `node -v`.
- Репозиторий: `git clone https://github.com/TryserPy/Mnema && cd Mnema && git checkout claude/wizardly-volta-879gpb && cd server && npm ci`.
- Аккаунты: OpenAI (платформа, с оплатой), Cloudflare (бесплатный), Brevo (бесплатный), Telegram, GitHub.

## 1. OpenAI — отдельный проект и ключи

1. Войди на https://platform.openai.com → Settings → Projects (https://platform.openai.com/settings/organization/projects) → **Create project** → имя `Refrain`.
2. В проекте: Settings → **Limits**: разреши **только** модель `gpt-6-luna`, остальные запрети.
3. Там же — **бюджет проекта** (например, $25 в месяц при бюджете $20 в панели Refrain). Это последний предохранитель.
4. API keys (https://platform.openai.com/api-keys) → выбери проект `Refrain` → **Create new secret key** → скопируй (показывается один раз).
5. ID проекта (`proj_…`) — в Settings → Projects, строка проекта.
6. Админ-ключ для сверки расхода: Organization → **Admin keys** (https://platform.openai.com/settings/organization/admin-keys) → создать; если есть вариант «только чтение» — выбери его. Без админ-ключа сверка с OpenAI просто молчит, остальное работает.

## 2. Brevo — письма с кодами входа

1. Регистрация: https://www.brevo.com → бесплатный план (около 300 писем в день; проверь текущие условия при регистрации).
2. Отправитель: Senders, Domains & Dedicated IPs → **Senders** (https://app.brevo.com/senders) → Add a sender → адрес, с которого придут коды (например, твой ящик) → подтверди по письму.
3. Ключ API: SMTP & API → **API Keys** (https://app.brevo.com/settings/keys/api) → Generate a new API key → скопируй (начинается с `xkeysib-`).

## 3. Telegram — бот для тревог и мини-приложения

1. Открой @BotFather (https://t.me/BotFather) → `/newbot` → имя и username бота → получишь **токен**.
2. Свой Telegram ID: напиши @userinfobot (https://t.me/userinfobot) → он ответит числом `Id`.
3. Кнопка мини-приложения: @BotFather → `/mybots` → твой бот → Bot Settings → **Menu Button** → Configure → адрес `https://tryserpy.github.io/Mnema-site/tg/` → название «Панель».
   Мини-приложение и панель появятся на сайте после слияния ветки Mnema-site в `main` (GitHub Pages берёт `main`).

## 4. GitHub — токен для багов

https://github.com/settings/personal-access-tokens/new → **Fine-grained token**:
- Repository access → Only select repositories → `TryserPy/Mnema`;
- Permissions → Repository → **Issues: Read and write** (остальное — No access);
- срок — по желанию (год). Скопируй токен.

## 5. Cloudflare — база и выкладка

1. Аккаунт: https://dash.cloudflare.com/sign-up. Адрес вида `<имя>.workers.dev` выбирается при первом заходе в Workers & Pages (https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. Вход из терминала (откроется браузер):
   ```bash
   npx wrangler login
   ```
3. База D1 (https://developers.cloudflare.com/d1/get-started/):
   ```bash
   npx wrangler d1 create refrain
   ```
   Команда выведет `database_id = "…"` — впиши его в `server/wrangler.toml` вместо `00000000-0000-0000-0000-000000000000` (это не секрет; можно прислать мне — впишу и запушу).
4. Таблицы:
   ```bash
   npx wrangler d1 migrations apply refrain --remote
   ```
5. Первая выкладка (из терминала — кнопка в GitHub Actions появится только после слияния в `main`):
   ```bash
   npx wrangler deploy
   ```
   В конце будет адрес `https://refrain-ai.<имя>.workers.dev` — **пришли его мне**: впишу в приложение (`REFRAIN_API`) и в панель на сайте.

## 6. Секреты сервера

Каждый — отдельной командой в папке `server`, значение вставляешь, когда спросит:

| Команда | Что вставить |
| --- | --- |
| `npx wrangler secret put OPENAI_API_KEY` | ключ проекта (шаг 1.4) |
| `npx wrangler secret put OPENAI_PROJECT_ID` | `proj_…` (шаг 1.5) |
| `npx wrangler secret put OPENAI_ADMIN_KEY` | админ-ключ (шаг 1.6) |
| `npx wrangler secret put TOKEN_SECRET` | случайная строка: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `npx wrangler secret put OWNER_EMAIL` | твоя почта (ты — группа «Ты», сюда коды панели и резервные тревоги) |
| `npx wrangler secret put OWNER_TELEGRAM_ID` | число из @userinfobot (шаг 3.2) |
| `npx wrangler secret put TELEGRAM_BOT_TOKEN` | токен бота (шаг 3.1) |
| `npx wrangler secret put TELEGRAM_WEBHOOK_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — сохрани, нужен в шаге 7 |
| `npx wrangler secret put ADMIN_PIN_HASH` | строка из `node scripts/pin-hash.mjs` (спросит PIN из 6 цифр; PIN запомни) |
| `npx wrangler secret put BREVO_API_KEY` | ключ Brevo (шаг 2.3) |
| `npx wrangler secret put MAIL_FROM` | адрес отправителя, подтверждённый в Brevo (шаг 2.2) |
| `npx wrangler secret put GITHUB_ISSUE_TOKEN` | токен GitHub (шаг 4) |

Проверка списка: `npx wrangler secret list`. `TOKEN_SECRET` потом не меняй без нужды — смена разлогинит всех.

## 7. Вебхук Telegram

Один раз, после выкладки (https://core.telegram.org/bots/api#setwebhook). Токен и секрет набери в своём терминале, никуда не копируй:
```bash
curl -sS "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
  -d url="https://refrain-ai.<имя>.workers.dev/v1/tg/webhook" \
  -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
  -d allowed_updates='["message"]'
```
Ответ `{"ok":true,…}`. Напиши боту `/status` — он должен ответить.

## 8. Выкладка из GitHub (после слияния в `main`)

1. Токен Cloudflare: https://dash.cloudflare.com/profile/api-tokens → Create Token → шаблон **Edit Cloudflare Workers** → добавь право **Account → D1 → Edit** → Create.
2. Account ID: Cloudflare → Workers & Pages → справа «Account ID» (https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/).
3. Секреты репозитория: https://github.com/TryserPy/Mnema/settings/secrets/actions → New repository secret: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
4. По желанию — ручное подтверждение выкладки: https://github.com/TryserPy/Mnema/settings/environments → `production` → Required reviewers.
5. Выкладка: https://github.com/TryserPy/Mnema/actions → «Сервер Refrain ИИ» → Run workflow → отметить **deploy** → Run.

## 9. Проверка после выкладки

- Бот: `/status` отвечает.
- Панель: кнопка «Панель» в боте → вход приходит сообщением в чат; на сайте https://tryserpy.github.io/Mnema-site/admin/ — вход по коду на почту и PIN.
- Приложение 1.31 (после того как я впишу адрес): Настройки → ИИ-помощник → Refrain ИИ → почта → код → конспект страницы. Ты (OWNER_EMAIL) входишь и в режиме «Тестировщики».
- Тревога: в панели «Пауза» → «Вернуть режим» — оба действия видны в «Журнале».

## 10. Порядок запуска

1. Сервер (шаги 1–9), режим «Тестировщики» — по умолчанию.
2. Тестировщики: панель → «Тестировщики и приглашения» → добавить почты или выдать приглашения `RFN-…`.
3. Выпуск приложения 1.31.0 — как обычно.
4. Открыть всем: панель → Доступ → «Все» (с PIN). Новая версия приложения не нужна.

## Если ключ OpenAI мог утечь

Сервер сам включит аварийную паузу (Refrain ИИ работает только у тебя) и пришлёт 🚨-тревогу. Отозвать ключ он не может.

1. В проекте OpenAI создай новый ключ (https://platform.openai.com/api-keys).
2. `npx wrangler secret put OPENAI_API_KEY` — вставь новый.
3. В OpenAI отзови старый ключ (Revoke).
4. В панели: «Ключ заменён» (PIN) → «Вернуть режим».

Подробности о Workers и wrangler: https://developers.cloudflare.com/workers/wrangler/commands/ · секреты: https://developers.cloudflare.com/workers/configuration/secrets/
