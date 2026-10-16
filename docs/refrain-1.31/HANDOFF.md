# Refrain 1.31 — передача

Ветка в обоих репозиториях: `claude/wizardly-volta-879gpb` (TryserPy/Mnema и TryserPy/Mnema-site). Выпуск 1.31.0: PR в `main` обоих репозиториев, тег `v1.31.0` в Mnema.

## Запуск (сделано владельцем, 16.10.2026)

- Сервер выложен: **https://refrain-ai.mnema-ai.workers.dev** (Cloudflare Workers, база D1 `refrain`, id в `server/wrangler.toml`). Выкладка — из папки `server`: `npx wrangler deploy` (кнопка в GitHub Actions появится после слияния в `main`).
- Все секреты заданы (`npx wrangler secret list`): OPENAI_API_KEY (ключ Polza.ai), TOKEN_SECRET, OWNER_EMAIL, OWNER_TELEGRAM_ID, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, ADMIN_PIN_HASH, MAIL_FROM, SMTP_PASSWORD, GITHUB_ISSUE_TOKEN.
- Бот подключён (`node scripts/set-webhook.mjs`), `/status` отвечает.
- `REFRAIN_API` в приложении и адрес по умолчанию в панели — этот адрес.
- Секреты и токены в чат не присылаются; если владелец показал токен на снимке — просить заменить его (`set-webhook.mjs` для бота).
- Из облачной среды Claude сервер, polza.ai и api.telegram.org недоступны: живые проверки делает владелец и присылает вывод.

## Что готово

| Часть | Состояние | Где |
| --- | --- | --- |
| Контракты (фаза 1) | утверждены | `docs/refrain-1.31/contracts.md`, `shared/refrain/*`, `shared/prompts/{markup,tasks,luna}.ts`, `src/styleModel.ts` |
| Сервер и защита (фаза 2) | готово, 65 тестов | `server/`, `docs/refrain-1.31/security-review.md`, CI `.github/workflows/server.yml` (выкладка вручную) |
| D Клиент Refrain ИИ | готово | `shared/refrainClient.mjs`, `shared/aiCore.mjs`, `electron/ai.cjs`, `Bridge.java`, `src/refrain*.ts`, `src/components/{RefrainSettings,RefrainHost,LimitScreen,ReportProblem}.tsx` |
| C Промты | готово | `shared/prompts/templates.ts`, `src/prompts.ts`, `src/components/PromptsSettings.tsx` (в разделе «ИИ-помощник») |
| B Выноски | готово | `src/callout*.ts`, `src/callouts.css`, `NoteEditor.tsx`, `Markdown.tsx`, `mdImport/mdExport/obsidian.ts` |
| F Тетрадь и файлы | готово | `src/notebook*.ts`, `src/fileImport*.ts`, `src/components/NotebookImport.tsx`, пункт «Из тетради» в «Создать» |
| A Оформление | готово | `src/styleMigrate.ts`, `styleActions.ts`, `LookSettings.tsx`, `ModsSettings.tsx`, `AppearanceAiGuide.tsx`, `shared/prompts/styleReference.ts` |
| E Сайт | готово | Mnema-site: `admin/`, `tg/`, `privacy/`, `e2e/admin.mjs` |
| Фаза 4: подключения ведущего | готово | `luna.ts` STYLE ← `STYLE_REFERENCE`; `PromptsSettings` → «ИИ»; «Объяснить иначе»/«Формула»/«Из тетради»/«Дословно» → шаблоны C |

Рабочие заметки потоков (`progress/`) и патчи `wip/` влиты и удалены.

## Проверки (итог)

- `npx tsc --noEmit` — чисто; `npx vitest run` — 66 файлов / 1122 теста; `npx vite build` и `npx vite build --mode web` — собираются.
- `cd server && npx tsc --noEmit && npx vitest run` — 70 тестов.
- e2e против `npx vite preview --mode web --outDir dist-web --port 4174` (Playwright глобальный, Chromium `/opt/pw-browsers/chromium-1194`):
  - `e2e/v131-refrain.mjs` — вход, счётчик, лимит → «Без интернета», закрытый тест → приглашение, «Сообщить о проблеме» (22 ✓);
  - `e2e/v131-callouts.mjs` — выноски, светлая/тёмная × 1280/380 (89 ✓);
  - `e2e/v131-notebook.mjs` — фото разворота и .docx (всё ✓);
  - `e2e/v131-overflow.mjs` — все стили (144) и дополнения (240) × темы × ширины, ничего не вылезает.
- Mnema-site: `node e2e/admin.mjs` — 84 ✓.
- Поиск настоящих ключей и почт по изменённым файлам — чисто (примеры — `@example.com`, ключи в тестах — заглушки).

## Осталось

- Проверка владельцем в приложении: вход по почте (код с ящика Яндекса), конспект с фото через Polza, карточки (`json_schema`). Если что-то упадёт — чинить по снимку ошибки.
- @BotFather Menu Button на `https://tryserpy.github.io/Mnema-site/tg/` (после слияния Mnema-site).
- После выпуска 1.31.0 — панель → Доступ → «Все».
- Выложить сервер после правок 16.10 (промт тетради n3, повтор при съеденном рассуждении): `cd server && npx wrangler deploy`.
- Справочник стилей для ИИ ≈ 11 тыс. знаков — больше оценки `promptTokens: 2500` у задачи `style` (резерв занижен, списание по факту). Решить: сжать справочник или поднять оценку в контракте.
- «Тетрадь»: корешок разворота не ищется по картинке — режется посередине.

## Правки по отзыву владельца (16.10, ветка `claude/beautiful-pascal-03tlir` в обоих репозиториях)

| Отзыв | Что сделано | Где |
| --- | --- | --- |
| Панель в боте некрасивая на телефоне, не открывается на Linux | Телефон/Telegram: «Обзор» + список разделов, раздел — с «Назад» (в Telegram — системная BackButton); компьютер — меню слева; таблицы на телефоне — карточками; исправлен CSS форм (`.inline` растягивался в колонку). Бот: `/panel`, `/start`, у ответов кнопка «🌐 В браузере» — одноразовая ссылка `admin/#link=…` на 5 минут (Telegram Desktop на Linux без WebKitGTK не открывает мини-приложения) | Mnema-site `admin/panel.{js,css}`, `admin/admin.js`, `tg/`; сервер `bot.ts`, `admin.ts` (`/v1/admin/login/link`, `mintPanelLink`), `telegram.ts` (`kind: 'url'`), `set-webhook.mjs` (меню команд) |
| Остаток денег на API | Баланс Polza (`GET /api/v1/balance`) в «Обзоре» панели (сколько, на сколько дней хватит, «Пополнить»), в `/status`, тревога `balance_low` (порог ₽ и дней — в «Бюджете»; по умолчанию 150 ₽ / 3 дня, не чаще раза в 6 ч) | сервер `balance.ts`, `cron.ts`; `shared/refrain/{policy,admin,guard}.ts`; панель `balanceKpi` |
| Жалобы только через Настройки → Справку | Флажок внизу боковой панели, «Профиль → Сообщить о проблеме», команда в Ctrl+P, клавиша Ctrl+Shift+E | `Sidebar.tsx`, `Profile.tsx`, `CommandPalette.tsx`, `keys.ts`, `App.tsx` |
| Повторное нажатие на «Настройки» возвращает не туда | Повторное нажатие на кнопку экрана — экран с нуля (раздел забыт, «Оформление» с вкладки «Стиль», прокрутка наверх). Телефон: «Профиль» изнутри настроек тоже сбрасывает раздел | `navMemory.ts` (`repress`, `forgetScreen`), `App.tsx` (`fresh` в key) |
| Сервис не видит мой ключ ИИ | Предположение: после обновления до 1.31 первым стал Refrain ИИ, и вкладка ИИ показывала его, пряча свой ключ. Теперь: настройки без `order` со своим ключом → свой ключ первым (`legacyOrder`); в режиме Refrain ИИ видно «🔑 Твой ключ сохранён… Сделать основным»; «Свой ИИ» выбирает ИИ, у которого есть ключ. **Ждём от владельца подтверждения/снимка, если не это** | `shared/aiCore.mjs`, `AiSettings.tsx`, `styleAi.ts`, тест `v131-aikey.test.ts` |
| Непонятно, как работает безопасность промтов | «ИИ-помощник → Как защищены промты» — 5 пунктов простыми словами | `PromptSafety.tsx` |

Проверки: `npx vitest run` (1133), сервер (76), `e2e/v131-refrain.mjs`, новый `e2e/v131-fixes.mjs`, Mnema-site `node e2e/admin.mjs`. Сервер нужно выложить (`cd server && npx wrangler deploy`) и перезапустить `node scripts/set-webhook.mjs`, чтобы появилось меню команд.

## Решения владельца

- Почта — отдельный ящик Яндекса по SMTP (`MAIL_FROM`, `SMTP_PASSWORD`, `smtp.yandex.ru:465`), без домена; запасные — Resend со своим доменом (`RESEND_API_KEY`) и Brevo (`BREVO_API_KEY`). Адрес сервера — `*.workers.dev`.
- Лимиты групп — из документа (`DEFAULT_GROUPS` в `shared/refrain/policy.ts`), меняются в панели: «Лимиты групп» (повышение — с PIN).
- Старт в режиме «Тестировщики» (`DEFAULT_ACCESS`).
- Возраст учеников и 152-ФЗ/GDPR — в `privacy/` не добавляем.
- «Разбить по темам с ИИ» — новая задача Refrain ИИ `file.split` (контракт, реестр, промт Luna, окно «Из тетради»).
- Справочник стилей: ждёт ответа — сжимать или поднять оценку.
- ИИ — через Polza.ai: `openai/gpt-6-luna`, `LLM_BASE_URL = https://polza.ai/api/v1`; деньги в рублях (страница ≈ 0,0386 ₽, бюджет по умолчанию 1 200 ₽/мес, меняется в панели); ученику — страницы по прайсу, бюджету — настоящая цена из ответа (`usage.cost_rub`, на коротких запросах ≈ вдвое выше прайса). Сверка расхода с OpenAI (утечка ключа) с Polza не работает — предохранитель — баланс Polza.
- Polza проверена владельцем: `max_completion_tokens` и `reasoning_effort` принимает, `cost_rub` в ответе есть. Не проверены: роль `developer`, фото и `json_schema` (карточки) — проверятся первым настоящим конспектом и карточками.

## Ключ Polza не работает на сервере (16.10, ветка `claude/gracious-dijkstra-mx7zot`)

Живой ответ Polza из облака не виден, поэтому — совместимость и диагностика:
- Через посредника (не `api.openai.com`) системный промт уходит с ролью `system`, без `store` (роль `developer` и `store` Polza не проверялись). Напрямую в OpenAI — как было.
- Ключ чистится от пробелов, перевода строки и «Bearer » (`llmKey` в `openai.ts`; так же для `/balance`).
- Ошибка поставщика (код и его сообщение, ключ заменён на `***`, без текста задачи) сохраняется в настройке `llmError` и видна в `/status` бота.
- Бот: `/check` — один короткий запрос тем же путём, что задачи (в учёт не идёт), ответ или ошибка с подсказкой и баланс Polza.
- После выкладки (`cd server && npx wrangler deploy`, затем `node scripts/set-webhook.mjs` для меню) — `/check` в боте; если ❌ — прислать текст ошибки.
