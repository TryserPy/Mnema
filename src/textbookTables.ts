// Таблицы Markdown из ответа ИИ: чинит типичные поломки, чтобы таблица открылась в редакторе (GFM).
// Чистые функции без сети и canvas — их проверяют тесты (v130-textbook.test.ts).
//  • разное число ячеек в строках, нет строки-разделителя, нет крайних «|», «|» внутри ячейки (формула |x|, «A | B»),
//    пустые строки между строками таблицы, пустые строки-«призраки»;
//  • tableTrouble — таблица совсем рассыпалась (почти всё пусто, одна колонка): такую лучше вырезать картинкой.

const SEP_CELL = /^\s*:?-{1,}:?\s*$/;

/** Разбивает строку таблицы на ячейки: «|» внутри `кода`, $формулы$ и после «\» ячейки не делит. */
export function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let cur = '';
  let code = false;
  let math = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      cur += c + s[i + 1];
      i++;
      continue;
    }
    if (c === '`') code = !code;
    else if (c === '$' && !code) math = !math;
    if (c === '|' && !code && !math) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur);
  // Крайние «|» дают пустые ячейки по краям — это не столбцы.
  if (s.startsWith('|')) cells.shift();
  if (s.endsWith('|') && !s.endsWith('\\|') && cells.length) cells.pop();
  return cells.map((x) => x.trim());
}

function isSepRow(cells: string[]): boolean {
  return cells.length >= 1 && cells.every((c) => SEP_CELL.test(c));
}

const hasPipe = (l: string) => l.includes('|');

/** Строка похожа на строку таблицы (есть «|» не внутри формулы и не одна на всю строку). */
function looksRow(line: string): boolean {
  if (!hasPipe(line) || /^\s*(```|\$\$)/.test(line)) return false;
  if (/^\s*>/.test(line) || /^\s*#/.test(line)) return false;
  return splitRow(line).length >= 2;
}

function cellOut(c: string): string {
  // «|» внутри ячейки — только как «\|».
  return c.replace(/(?<!\\)\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function align(sep: string): string {
  const l = sep.trim().startsWith(':');
  const r = sep.trim().endsWith(':');
  return l && r ? ':---:' : r ? '---:' : l ? ':---' : '---';
}

/** Одна таблица: строки без пустых → ровная GFM-таблица. */
function rebuild(rows: string[][], sepAt: number, seps: string[] | null): string[] {
  // Число столбцов — какое чаще встречается в строках; при равенстве — больше.
  const cnt = new Map<number, number>();
  rows.forEach((r, i) => i !== sepAt && !isSepRow(r) && cnt.set(r.length, (cnt.get(r.length) ?? 0) + 1));
  const headLen = rows[0].length;
  let n = 2;
  let best = -1;
  for (const [len, c] of cnt) if (c > best || (c === best && len !== headLen && n !== headLen && len > n)) (best = c), (n = len);
  const fit = (r: string[]) => {
    const x = r.slice(0, n);
    // Лишние ячейки сливаем в последнюю (чаще всего «|» в тексте ячейки).
    if (r.length > n) x[n - 1] = r.slice(n - 1).join(' / ');
    while (x.length < n) x.push('');
    return x;
  };
  const body = rows.filter((r, i) => i !== sepAt && !isSepRow(r)).map(fit).filter((r) => r.some((c) => c.trim()));
  if (!body.length) return [];
  const head = body[0];
  const al = Array.from({ length: n }, (_, i) => align(seps?.[i] ?? '---'));
  return [`| ${head.map(cellOut).join(' | ')} |`, `| ${al.join(' | ')} |`, ...body.slice(1).map((r) => `| ${r.map(cellOut).join(' | ')} |`)];
}

/**
 * Находит в тексте таблицы и приводит их к ровному GFM. Остальной текст, формулы $$…$$ и блоки ``` не трогает.
 * Одиночная строка с «|» без разделителя таблицей не считается.
 */
export function fixTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; ) {
    const ln = lines[i];
    if (/^\s*(```|~~~)/.test(ln)) fence = !fence;
    if (/^\s*\$\$\s*$/.test(ln)) {
      // блок формулы $$ … $$ переписываем как есть
      out.push(ln);
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) out.push(lines[i++]);
      if (i < lines.length) out.push(lines[i++]);
      continue;
    }
    if (fence || !looksRow(ln)) {
      out.push(ln);
      i++;
      continue;
    }
    // Собираем блок: строки таблицы, между ними допускаем пустые, если дальше таблица продолжается.
    const rows: string[][] = [];
    let sepAt = -1;
    let seps: string[] | null = null;
    let j = i;
    while (j < lines.length) {
      const l = lines[j];
      if (looksRow(l)) {
        const cells = splitRow(l);
        // Разделитель — сразу после первой строки; лишние строки из «---» отбрасываем.
        if (isSepRow(cells)) {
          if (sepAt < 0 && rows.length === 1) (sepAt = rows.length), (seps = cells), rows.push(cells);
        } else rows.push(cells);
        j++;
        continue;
      }
      if (!l.trim()) {
        // Пустая строка внутри таблицы: дальше идёт строка таблицы, и это не начало новой (за ней нет разделителя).
        let k = j;
        while (k < lines.length && !lines[k].trim()) k++;
        if (k < lines.length && looksRow(lines[k]) && rows.length && !(k + 1 < lines.length && looksRow(lines[k + 1]) && isSepRow(splitRow(lines[k + 1]))) && !isSepRow(splitRow(lines[k]))) {
          j = k;
          continue;
        }
      }
      break;
    }
    const real = rows.filter((_, r) => r !== sepAt);
    if (rows.length < 2 && sepAt < 0) {
      out.push(ln);
      i++;
      continue;
    }
    if (real.length < 1 || (sepAt < 0 && real.length < 2)) {
      out.push(ln);
      i++;
      continue;
    }
    const built = rebuild(rows, sepAt, seps);
    if (!built.length) {
      i = j;
      continue;
    }
    if (out.length && out[out.length - 1].trim()) out.push('');
    out.push(...built);
    i = j;
    if (i < lines.length && lines[i].trim()) out.push('');
  }
  return out.join('\n');
}

export interface TableTrouble {
  /** Сколько таблиц в тексте. */
  tables: number;
  /** Таблиц, которые рассыпались (почти всё пусто или один столбец). */
  broken: number;
}

/** Проверка уже починенного текста: сколько таблиц и сколько из них «не таблицы» (их лучше вставить картинкой). */
export function tableTrouble(md: string): TableTrouble {
  const lines = md.split('\n');
  let tables = 0;
  let broken = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!looksRow(lines[i]) || i + 1 >= lines.length || !isSepRow(splitRow(lines[i + 1])) || !looksRow(lines[i + 1])) continue;
    const rows = [splitRow(lines[i])];
    let k = i + 2;
    while (k < lines.length && looksRow(lines[k])) rows.push(splitRow(lines[k++]));
    tables++;
    const cells = rows.flat();
    const empty = cells.filter((c) => !c.trim()).length;
    if (rows[0].length < 2 || empty / cells.length > 0.5 || (rows.length === 1 && rows[0].length > 2 && !rows[0].every((c) => c.trim()))) broken++;
    i = k;
  }
  return { tables, broken };
}
