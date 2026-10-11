// Локальный конфиг для проверок: свой кэш, чтобы не мешать другим кодерам (общий node_modules). Не коммитится.
import base from './vite.config';
export default (env: any) => ({ ...(base as any)(env), cacheDir: '/tmp/claude-0/-home-user/53752e40-a8a4-53ff-9bf3-3aa7dad8b74a/scratchpad/vcache', server: { fs: { strict: false } } });
