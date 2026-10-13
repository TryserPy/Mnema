# Поток D (клиент Refrain ИИ) — ход работ

Ветка: `worktree-agent-a973f6f6409b74f12` (перемотана fast-forward на `7f40db1` — коммит контрактов из `claude/wizardly-volta-879gpb`; история не переписывалась).

## Готово

- Прочитаны задание (streams.md, раздел D), контракты (contracts.md раздел 1, `shared/refrain/api.*`, `shared/prompts/tasks.ts`, `luna.ts`), сервер (`sign.ts`, `auth.ts`, `task.ts`, `me.ts`, `bugs.ts`, `test/helpers.ts`), клиентский код (`shared/aiCore.mjs`, `electron/ai.cjs`, `src/platform/android.ts`, `Bridge.java`, `src/ai.ts`, `aiTasks.ts`, `textbook.ts`, `AiSettings.tsx`, `plugins/host.ts`), спецификация (разделы 4–6).
- Кода потока D ещё нет.

## План (что осталось)

1. `shared/refrainClient.mjs` (+`.d.mts`): синхронный SHA-256, PoW с уступками потоку, вход (pow → start → verify, `device_limit` → `replaceDevice`), подпись по `canonicalString`, обновление токена строго по одному (single-flight), задачи, `me`, приглашение, отвязка, удаление аккаунта, выход, баг-репорт; кэш ответов 7 дней.
2. `shared/aiCore.mjs`: поставщик `refrain`, порядок `refrain → key → local` (настраивается), переход дальше при `limit_*`, `paused`, `access_closed`, `blocked`, `upstream`, нет сети; запрос без `refrain` идёт мимо Refrain ИИ.
3. Electron (`electron/ai.cjs`, `preload.cjs`): ключ P-256 через Node crypto, секрет только в `safeStorage` (без него вход не разрешается), подпись `ieee-p1363`; IPC `refrain:*`, снимок экрана для баг-репорта.
4. Android (`Bridge.java`, `src/platform/android.ts`): EC-ключ в Android Keystore (неизвлекаемый), SHA256withECDSA, DER → r‖s; токены через `encrypt`/`prefSet`.
5. `src/refrain*.ts`: сборка `refrain` для задач (рамки из `TASK_SPECS`/`FIELD_LIMITS`), уменьшение фото до 1600 px, тексты ошибок по кодам, журнал для баг-репорта; `REFRAIN_API` — одна константа (заглушка `https://refrain-ai.example.workers.dev`, заменить при запуске).
6. Вызовы: `textbook.ts` (summary/brief/verbatim/merge), `ai.ts` (cards, explain, formula), одна строка в `styleAi.ts`; `aiTasks.aiRequest` дописывает `wishes`.
7. UI: Refrain ИИ в `AiSettings.tsx` (вход, счётчик «N из M страниц», порядок, устройства, удалить аккаунт, приглашение), `LimitScreen.tsx`, `ReportProblem.tsx` (О программе, под ошибкой ИИ, `ErrorBoundary`).
8. Тесты `src/v131-refrain.test.ts` на заглушке сервера; дополнить `src/ai-key-server.test.ts`.
9. Проверки: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`, `npx vite build --mode web`.

## Проверки

Ещё не запускались (кода нет).
