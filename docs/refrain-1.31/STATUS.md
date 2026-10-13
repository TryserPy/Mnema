# Refrain 1.31 — состояние работ

Файл для продолжения работы в новой сессии. Обновляется после каждого шага. Ветка: `claude/wizardly-volta-879gpb` (Mnema и Mnema-site).
Спецификация: артефакт «Refrain 1.31 — проект». Контракты: `docs/refrain-1.31/contracts.md`.

## Фазы

| Фаза | Состояние | Что дальше |
| --- | --- | --- |
| 0. Разведка | готово | — |
| 1. Контракты | утверждены пользователем | — |
| 2. Сервер и защита (`server/`) | готово: 56 тестов (`cd server && npm ci && npx vitest run`) | security-review в фазе 4 |
| 3. Потоки A–F | запущены параллельно: A, B, C, D, F — подагенты в отдельных worktree Mnema (ветки worktree, без пуша); E — в /home/user/Mnema-site на этой ветке | собрать ветки, решить конфликты; если сессия прервалась — перезапустить незавершённые потоки по `streams.md` |
| 4. Интеграция и проверка | идёт независимый security-review сервера | после потоков — интеграция, подключения ведущего (см. ниже) |

## Решения по умолчанию (ждут ответа пользователя)

- Почта: Brevo, адрес сервера `*.workers.dev`.
- Лимиты групп — из документа.
- Режим доступа на старте — «Тестировщики».
- Идеи из раздела 9 — не делаем.
- Возраст учеников / 152-ФЗ / GDPR — не решено; `privacy/` пишется нейтрально.

## Проверки репозитория

Mnema: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`, `npx vite build --mode web` (как в `.github/workflows/ci.yml`; линтера в репозитории нет).
Сервер: `cd server && npm ci && npx tsc --noEmit && npx vitest run` (workflow `server.yml`; выкладка только вручную).
Mnema-site: сборки и тестов нет (статический сайт).

## Журнал

- Фаза 0: базовые проверки зелёные (tsc ok, 60 файлов / 963 теста). Ссылки документа на код совпадают.
- Фаза 1: контракты в `shared/refrain/*`, `shared/prompts/{markup,tasks}.ts`, `src/styleModel.ts`; тест `src/contracts131.test.ts`.
- Фаза 2: `server/` — Worker + D1 + DO; модуль защиты `server/src/guard/`; тесты `server/test/*` (правила, вход, задачи, атаки, тревоги). Дополнения контракта: `replaceDevice`, `ipShareKnown`, `token_unknown` → аккаунт и IP.

## Подключения, которые делает ведущий при интеграции

- `shared/prompts/luna.ts` STYLE ← `shared/prompts/styleReference.ts` (поток A).
- `src/components/PromptsSettings.tsx` (C) → раздел «ИИ» в `Settings.tsx` / `AiSettings.tsx` (D).
- Промты «Объяснить иначе» и «Формула» из `src/ai.ts` → шаблоны C (C не трогает `ai.ts`).
- «Из тетради» (F) для своего ключа: `lunaSystem('notebook.read')` → шаблоны C.
