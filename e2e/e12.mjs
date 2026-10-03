import { _electron as electron } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';
fs.rmSync('/tmp/vaultOut', { recursive: true, force: true });
fs.mkdirSync('/tmp/vaultOut');
fs.rmSync('/tmp/obsA', { recursive: true, force: true });
// Настройки по разделам: строка «название — кнопка» (.srow) в разделе «Данные»
const rowBtn = (w, label, btn) => w.locator('.srow', { has: w.locator('.srow-label', { hasText: new RegExp('^' + label + '$') }) }).getByRole('button', { name: btn });
const app = await electron.launch({ executablePath: process.cwd() + '/node_modules/electron/dist/electron', args: [process.cwd() + '', '--no-sandbox'], env: { ...process.env, MNEMA_USER_DATA: '/tmp/obsA' } });
await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ['/tmp/vaultOut'] }); });
const win = await app.firstWindow();
await win.getByRole('button', { name: 'Пропустить' }).click({ timeout: 2500 }).catch(() => {}); // знакомство при первом запуске
await win.getByRole('button', { name: 'Посмотреть на примере' }).click();
await win.getByRole('button', { name: 'Настройки', exact: true }).click();
await win.locator('.set-nav-item', { hasText: 'Данные' }).click();
await rowBtn(win, 'В Obsidian', 'Экспорт').click();
await win.locator('.hint', { hasText: 'Готово' }).waitFor();
console.log(await win.locator('.hint', { hasText: 'Готово' }).innerText());
await app.close();
console.log(execSync('cd /tmp/vaultOut && find . -type f | sort && echo ---- && cat "Мнема/Физика/§8 Закон Ома.md" | head -40').toString());
