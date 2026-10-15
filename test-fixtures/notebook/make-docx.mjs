// Собирает учебные .docx для «Из тетради → Файл» без Word: минимальный набор частей (document, styles, numbering, rels, картинка).
// Запуск: node test-fixtures/notebook/make-docx.mjs — перезапишет biology.docx рядом. Тесты берут makeDocx отсюда же.
// Текст — придуманный школьный конспект, без личных данных.
import { strToU8, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
export const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Кусочки разметки Word
export const t = (s, o = {}) => `<w:r>${o.b || o.i || o.hl ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.hl ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;
export const p = (runs, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`;
export const li = (runs, numId = 1) => `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs}</w:p>`;
export const h = (level, s) => p(t(s), String(level)); // в русском Word id стиля заголовка — «1», «2»…
export const table = (rows) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(t(c))}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
export const img = (rid = 'rIdImg1') => `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
export const frac = (a, b) => `<m:oMath><m:f><m:num><m:r><m:t>${esc(a)}</m:t></m:r></m:num><m:den><m:r><m:t>${esc(b)}</m:t></m:r></m:den></m:f></m:oMath>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/><w:basedOn w:val="a"/></w:style>
<w:style w:type="paragraph" w:styleId="3"><w:name w:val="heading 3"/><w:basedOn w:val="a"/></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

/** body — разметка внутри <w:body>; withStyles=false — документ без стилей заголовков (жирные строки вместо них). */
export function makeDocx(body, { withStyles = true, pages } = {}) {
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
<Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>
</Relationships>`;
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/></Types>'),
    'word/document.xml': strToU8(doc),
    'word/_rels/document.xml.rels': strToU8(rels),
    'word/numbering.xml': strToU8(NUMBERING),
    'word/media/image1.png': Uint8Array.from(Buffer.from(PNG_1PX, 'base64'))
  };
  if (withStyles) files['word/styles.xml'] = strToU8(STYLES);
  if (pages) files['docProps/app.xml'] = strToU8(`<?xml version="1.0"?><Properties><Pages>${pages}</Pages></Properties>`);
  return zipSync(files);
}

/** «Биология 8 класс.docx» из макета: 3 раздела, 2 таблицы, рисунок, формула, список, ДЗ на 14.10. */
export function biologyDocx() {
  return makeDocx(
    [
      h(1, 'Биология 8 класс'),
      h(2, '§ 12. Фотосинтез'),
      p(t('Фотосинтез', { b: true }) + t(' — это образование органических веществ из углекислого газа и воды на свету.')),
      p(t('Идёт в ') + t('хлоропластах', { hl: true }) + t(' клеток листа.')),
      li(t('Световая фаза — образуется АТФ.')),
      li(t('Темновая фаза — образуется глюкоза.')),
      table([['Фаза', 'Где идёт'], ['Световая', 'мембраны тилакоидов'], ['Темновая', 'строма']]),
      p(img()),
      p(t('КПД листа: ') + frac('E полезная', 'E света')),
      h(2, '§ 13. Дыхание растений'),
      p(t('Дыхание', { b: true }) + t(' — окисление органических веществ с выделением энергии.')),
      table([['Процесс', 'Газ на входе'], ['Фотосинтез', 'CO2'], ['Дыхание', 'O2']]),
      h(2, 'Домашнее задание на 14.10'),
      li(t('§ 12, вопросы 1–3'), 2),
      li(t('Выучить определения'), 2)
    ].join(''),
    { pages: 14 }
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('./biology.docx', import.meta.url), biologyDocx());
  console.log('biology.docx готов');
}
