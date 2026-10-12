// Защита сервера синхронизации по Wi-Fi (electron/sync.cjs) — чистая логика без сети, чтобы её можно было проверять тестами.
// Что здесь: блок адреса, с которого перебирают код; ограничение одновременных обменов; одноразовые билеты обмена; память о нонсах (повтор запроса).
const crypto = require('crypto');

const LIMITS = {
  /** Сколько неудач (неверный код, чужой билет, повтор) терпим от одного адреса, потом блок. */
  maxBad: 8,
  /** На сколько блокируем адрес. Сервер и так живёт 15 минут. */
  blockMs: 15 * 60 * 1000,
  /** Сколько обменов данными (/sync) идёт одновременно. Каждый занимает окно Refrain и память. */
  maxSync: 2,
  /** Сколько билетов можно держать выданными (на каждый «hello», который прошёл проверку кода). */
  maxTickets: 8,
  ticketMs: 5 * 60 * 1000,
  /** Размер тела до проверки кода (hello и всё, что приходит без билета). */
  preAuthBody: 64 * 1024,
  /** Размер тела обмена данными — только с действующим билетом, то есть от того, кто знает код. */
  syncBody: 300 * 1024 * 1024,
  maxNonces: 5000
};

/** Адрес источника без «::ffff:» у IPv4. */
function ipOf(req) {
  const a = (req && req.socket && req.socket.remoteAddress) || '';
  return a.replace(/^::ffff:/i, '');
}

function createGuard(opts = {}) {
  const L = { ...LIMITS, ...opts };
  const now = opts.now || (() => Date.now());
  const bad = new Map(); // ip → { n, until }
  const tickets = new Map(); // билет → до какого времени действует
  const nonces = new Set();
  let syncing = 0;

  const guard = {
    limits: L,
    /** true — адрес заблокирован. */
    blocked(ip) {
      const b = bad.get(ip);
      if (!b) return false;
      if (b.until && b.until <= now()) {
        bad.delete(ip);
        return false;
      }
      return Boolean(b.until);
    },
    /** Записать неудачу; true — после неё адрес заблокирован. */
    fail(ip) {
      const b = bad.get(ip) || { n: 0, until: 0 };
      b.n++;
      if (b.n >= L.maxBad) b.until = now() + L.blockMs;
      bad.set(ip, b);
      return Boolean(b.until);
    },
    /** Кода хватило — неудачи этого адреса забываются. */
    ok(ip) {
      const b = bad.get(ip);
      if (b && !b.until) bad.delete(ip);
    },
    /** Нонс запроса уже встречался? (повторно присланный перехваченный запрос). Первый раз запоминает. */
    replayed(n) {
      if (typeof n !== 'string' || !n || n.length > 100) return true;
      if (nonces.has(n)) return true;
      if (nonces.size >= L.maxNonces) return true; // забито — лучше отказать, чем забыть старое и пустить повтор
      nonces.add(n);
      return false;
    },
    /** Выдать билет на один обмен. null — выдано слишком много. */
    issueTicket() {
      for (const [t, until] of tickets) if (until <= now()) tickets.delete(t);
      if (tickets.size >= L.maxTickets) return null;
      const t = crypto.randomBytes(16).toString('hex');
      tickets.set(t, now() + L.ticketMs);
      return t;
    },
    /** Погасить билет (одноразовый). true — билет был действующим. */
    useTicket(t) {
      if (typeof t !== 'string') return false;
      const until = tickets.get(t);
      if (until === undefined) return false;
      tickets.delete(t);
      return until > now();
    },
    /** Занять место для обмена. false — все места заняты. */
    enterSync() {
      if (syncing >= L.maxSync) return false;
      syncing++;
      return true;
    },
    leaveSync() {
      if (syncing > 0) syncing--;
    },
    get syncing() {
      return syncing;
    }
  };
  return guard;
}

/**
 * Читать тело запроса не дальше limit байт. Превышение — запрос обрывается, промис отклоняется с кодом 'TOO_BIG'.
 * Лишнее не копится в памяти: как только перебор, чтение прекращается.
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers && req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      const e = new Error('Слишком большое сообщение');
      e.code = 'TOO_BIG';
      return reject(e);
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        const e = new Error('Слишком большое сообщение');
        e.code = 'TOO_BIG';
        reject(e);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks).toString('utf8'));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

module.exports = { LIMITS, createGuard, ipOf, readBody };
