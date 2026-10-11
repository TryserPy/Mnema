const WT = '/home/user/Mnema/.claude/worktrees/agent-a370845ee40a2fce2';
const { createWorker } = require(WT + '/node_modules/tesseract.js');
(async () => {
  const w = await createWorker(['rus', 'eng'], 1, { langPath: WT + '/ocr-data', gzip: true, cachePath: '/tmp/claude-0/-home-user/42e32f48-0245-5948-bab9-36632f5d2fa7/scratchpad/textbook/cache' });
  const img = process.argv[2];
  for (const psm of process.argv.slice(3)) {
    await w.setParameters({ tessedit_pageseg_mode: psm });
    const t = Date.now();
    const r = await w.recognize(img, {}, { blocks: true, text: false });
    console.log('PSM', psm, 'blocks', r.data.blocks.length, Date.now() - t, 'ms');
    for (const b of r.data.blocks) console.log(' BLOCK type', b.blocktype, JSON.stringify(b.bbox), 'paras', b.paragraphs.length, 'lines', b.paragraphs.reduce((a, p) => a + p.lines.length, 0));
  }
  await w.terminate();
})();
