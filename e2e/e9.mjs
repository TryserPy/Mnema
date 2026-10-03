// Синхронизация двух копий Мнемы: «компьютер» показывает код, «второе устройство» вводит его.
import { _electron as electron } from 'playwright';
import fs from 'fs';
const OUT = process.env.OUT;
const EXE = process.cwd() + '/node_modules/electron/dist/electron';
const A = '/tmp/mnemaA', B = '/tmp/mnemaB';
for (const d of [A, B]) fs.rmSync(d, { recursive: true, force: true });
// Настройки по разделам: строка «название — кнопка» (.srow) в разделе «Данные»
const rowBtn = (w, label, btn) => w.locator('.srow', { has: w.locator('.srow-label', { hasText: new RegExp('^' + label + '$') }) }).getByRole('button', { name: btn });
const step = (s) => console.log('•', s);
const pc = await electron.launch({ executablePath: EXE, args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: A } });
const ph = await electron.launch({ executablePath: EXE, args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: B } });
const w1 = await pc.firstWindow();
const w2 = await ph.firstWindow();
// На «компьютере» — пример; на «телефоне» — свой предмет и тема.
for (const w of [w1, w2]) await w.getByRole('button', { name: 'Пропустить' }).click({ timeout: 8000 }).catch(() => {}); // знакомство при первом запуске
await w1.getByRole('button', { name: 'Посмотреть на примере' }).click();
await w2.getByRole('button', { name: /Добавить предмет/ }).first().click();
await w2.getByPlaceholder('Например: Биология').fill('Английский');
await w2.locator('.modal').getByRole('button', { name: 'Создать' }).click();
await w2.getByRole('button', { name: /Тема/ }).first().click();
await w2.getByPlaceholder(/Название темы/).fill('Unit 3');
await w2.keyboard.press('Enter');
await w2.waitForTimeout(800);
// Компьютер: открыть синхронизацию
await w1.getByRole('button', { name: 'Настройки', exact: true }).click();
await w1.locator('.set-nav-item', { hasText: 'Данные' }).click();
await rowBtn(w1, 'Синхронизация по Wi-Fi', 'Открыть').click();
await w1.locator('.sync-qr').waitFor();
const codes = await w1.locator('.big-code').allInnerTexts();
step('pc shows: ' + codes.join(' | '));
await w1.screenshot({ path: OUT + '/s1-qr.png' });
const addr = codes[0].trim();
const code = codes[1].replace(/^\s*код\s*/, ''); // 12 знаков вида K7QM-2XPA-9RTD
// Второе устройство: ввести
await w2.getByRole('button', { name: 'Настройки', exact: true }).click();
await w2.locator('.set-nav-item', { hasText: 'Данные' }).click();
await rowBtn(w2, 'Синхронизация по Wi-Fi', 'Открыть').click();
await w2.getByRole('radio', { name: 'Ввести код другого' }).click();
await w2.getByLabel('Адрес').fill(addr.replace(/^[\d.]+/, '127.0.0.1'));
await w2.getByLabel('Код').fill(code);
await w2.getByRole('button', { name: 'Синхронизировать' }).click();
await w2.locator('.hint.ok, .hint.warn').waitFor({ timeout: 30000 });
step('client: ' + (await w2.locator('.modal .hint').innerText()));
await w1.locator('.modal .hint.ok').waitFor({ timeout: 10000 });
step('server: ' + (await w1.locator('.modal .hint.ok').innerText()));
await w1.screenshot({ path: OUT + '/s2-done.png' });
await w2.waitForTimeout(1200);
await w1.waitForTimeout(1200);
const trees = [await w1.locator('.tree').innerText(), await w2.locator('.tree').innerText()];
step('pc tree: ' + trees[0].replace(/\n+/g, ' | '));
step('phone tree: ' + trees[1].replace(/\n+/g, ' | '));
// Неверный код
await w2.getByRole('button', { name: 'Готово' }).click();
await rowBtn(w2, 'Синхронизация по Wi-Fi', 'Открыть').click();
await w2.getByRole('radio', { name: 'Ввести код другого' }).click();
await w2.getByLabel('Адрес').fill(addr.replace(/^[\d.]+/, '127.0.0.1'));
await w2.getByLabel('Код').fill('0000-0000-0000');
await w2.getByRole('button', { name: 'Синхронизировать' }).click();
await w2.locator('.modal .hint.warn').waitFor({ timeout: 20000 });
step('wrong code: ' + (await w2.locator('.modal .hint.warn').innerText()));
await pc.close();
await ph.close();
const da = JSON.parse(fs.readFileSync(A + '/mnema-data.json', 'utf8'));
const db = JSON.parse(fs.readFileSync(B + '/mnema-data.json', 'utf8'));
console.log('files equal content:', da.subjects.length, db.subjects.length, da.cards.length, db.cards.length, da.topics.length, db.topics.length);
