// Хэш PIN для секрета ADMIN_PIN_HASH: node scripts/pin-hash.mjs → ввести PIN → `wrangler secret put ADMIN_PIN_HASH` и вставить строку.
// PIN в командную строку не передаётся (чтобы не остался в истории терминала).
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const iterations = Number(process.env.PIN_ITERATIONS || 100000);
const rl = createInterface({ input: process.stdin, output: process.stderr });
rl.question('PIN (6 цифр): ', (pin) => {
  rl.close();
  if (!/^\d{6}$/.test(pin.trim())) {
    console.error('Нужно ровно 6 цифр.');
    process.exit(1);
  }
  const salt = process.env.PIN_SALT ? Buffer.from(process.env.PIN_SALT) : randomBytes(16);
  const hash = pbkdf2Sync(pin.trim(), salt, iterations, 32, 'sha256');
  console.log(`pbkdf2$${iterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`);
});
