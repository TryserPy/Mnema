// Подключить бота к серверу одной командой: node scripts/set-webhook.mjs [адрес сервера]
// Спрашивает токен бота (ввод не виден), задаёт секреты TELEGRAM_BOT_TOKEN и новый TELEGRAM_WEBHOOK_SECRET через wrangler
// и ставит вебхук в Telegram с тем же секретом. Токен не выводится и не попадает в историю терминала.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const server = (process.argv[2] || 'https://refrain-ai.mnema-ai.workers.dev').replace(/\/+$/, '');

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(q)) process.stderr.write(q);
    };
    rl.question(q, (a) => {
      rl.close();
      process.stderr.write('\n');
      resolve(a);
    });
  });
}

function putSecret(name, value) {
  execFileSync('npx', ['wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
}

// При вставке терминал бывает добавляет служебные коды (\e[200~ … \e[201~), пробелы и переводы строк — убираем.
const raw = await askHidden('Токен бота (из @BotFather, ввод не виден): ');
const token = raw.replace(/\x1b\[20[01]~/g, '').replace(/[\s\x00-\x1f\x7f]/g, ''); // eslint-disable-line no-control-regex
if (!/^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token)) {
  console.error('Это не похоже на токен бота (вид: 123456789:AA…). Скопируй его ещё раз в @BotFather → /mybots → бот → API Token.');
  process.exit(1);
}

const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()).catch(() => null);
if (!me?.ok) {
  console.error('Telegram не принял токен. Возможно, он отозван — возьми актуальный в @BotFather.');
  process.exit(1);
}
console.error(`Бот: @${me.result.username}`);

const secret = randomBytes(32).toString('hex');
putSecret('TELEGRAM_BOT_TOKEN', token);
putSecret('TELEGRAM_WEBHOOK_SECRET', secret);

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  body: new URLSearchParams({ url: `${server}/v1/tg/webhook`, secret_token: secret, allowed_updates: '["message"]' })
}).then((r) => r.json());
if (!res.ok) {
  console.error(`Telegram не поставил вебхук: ${res.description}`);
  process.exit(1);
}
console.error(`Готово: вебхук → ${server}/v1/tg/webhook. Напиши боту /status.`);
