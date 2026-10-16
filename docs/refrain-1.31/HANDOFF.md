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

## Решения владельца

- Почта — отдельный ящик Яндекса по SMTP (`MAIL_FROM`, `SMTP_PASSWORD`, `smtp.yandex.ru:465`), без домена; запасные — Resend со своим доменом (`RESEND_API_KEY`) и Brevo (`BREVO_API_KEY`). Адрес сервера — `*.workers.dev`.
- Лимиты групп — из документа (`DEFAULT_GROUPS` в `shared/refrain/policy.ts`), меняются в панели: «Лимиты групп» (повышение — с PIN).
- Старт в режиме «Тестировщики» (`DEFAULT_ACCESS`).
- Возраст учеников и 152-ФЗ/GDPR — в `privacy/` не добавляем.
- «Разбить по темам с ИИ» — новая задача Refrain ИИ `file.split` (контракт, реестр, промт Luna, окно «Из тетради»).
- Справочник стилей: ждёт ответа — сжимать или поднять оценку.
- ИИ — через Polza.ai: `openai/gpt-6-luna`, `LLM_BASE_URL = https://polza.ai/api/v1`; деньги в рублях (страница ≈ 0,0386 ₽, бюджет по умолчанию 1 200 ₽/мес, меняется в панели); ученику — страницы по прайсу, бюджету — настоящая цена из ответа (`usage.cost_rub`, на коротких запросах ≈ вдвое выше прайса). Сверка расхода с OpenAI (утечка ключа) с Polza не работает — предохранитель — баланс Polza.
- Polza проверена владельцем: `max_completion_tokens` и `reasoning_effort` принимает, `cost_rub` в ответе есть. Не проверены: роль `developer`, фото и `json_schema` (карточки) — проверятся первым настоящим конспектом и карточками.
