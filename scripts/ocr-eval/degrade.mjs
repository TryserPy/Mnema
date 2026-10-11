// Превращает чистые страницы в «фото с телефона»: поворот, перспектива, тень, шум, изгиб, JPEG.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const names = ['physics', 'biology', 'history2'];
const LEVELS = {
  clean: { rot: 0, rx: 0, ry: 0, noise: 0, blur: 0, q: 0.92, shadow: 0, band: 0, curl: 0, scale: 1.0 },
  mild: { rot: 3, rx: 0, ry: 0, noise: 7, blur: 0.5, q: 0.7, shadow: 0.28, band: 0, curl: 0, scale: 1.2 },
  heavy: { rot: -6, rx: 5, ry: 9, noise: 15, blur: 1.1, q: 0.5, shadow: 0.45, band: 0.5, curl: 16, scale: 1.3 }
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const pg = await browser.newPage({ viewport: { width: 2400, height: 3200 } });
for (const name of names) {
  const b64 = fs.readFileSync(`pages/${name}.png`).toString('base64');
  for (const [lv, L] of Object.entries(LEVELS)) {
    let jpeg;
    if (lv === 'clean') {
      await pg.setContent(`<body style="margin:0"><canvas id=c width=1500 height=2100></canvas>`);
      jpeg = await pg.evaluate(async ([b64, L]) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.getElementById('c');
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/jpeg', L.q).split(',')[1];
      }, [b64, L]);
    } else {
      await pg.setContent(`<body style="margin:0;background:#6b5b48;overflow:hidden"><div style="width:2400px;height:3200px;background:radial-gradient(circle at 30% 20%,#9a8a70,#5b4c3a);position:relative;perspective:3200px"><img id=p style="position:absolute;left:450px;top:550px;width:1500px;height:2100px;transform:rotateX(${L.rx}deg) rotateY(${L.ry}deg) rotateZ(${L.rot}deg) scale(${L.scale});box-shadow:0 30px 80px rgba(0,0,0,.5)" src="data:image/png;base64,${b64}"></div>`);
      await pg.waitForTimeout(200);
      const shot = (await pg.screenshot({ clip: { x: 0, y: 0, width: 2400, height: 3200 } })).toString('base64');
      jpeg = await pg.evaluate(async ([shot, L, seedN]) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + shot;
        await img.decode();
        const W = 2400, H = 3200;
        let c = document.createElement('canvas');
        c.width = W; c.height = H;
        let x = c.getContext('2d');
        // изгиб страницы: полосы смещаются по вертикали
        if (L.curl) {
          for (let sx = 0; sx < W; sx += 4) {
            const t = sx / W;
            const dy = L.curl * Math.sin(Math.PI * t * 1.4) - L.curl * 0.3;
            x.drawImage(img, sx, 0, 4, H, sx, dy, 4, H);
          }
        } else x.drawImage(img, 0, 0);
        // размытие (линза/движение)
        if (L.blur) {
          const c2 = document.createElement('canvas');
          c2.width = W; c2.height = H;
          const x2 = c2.getContext('2d');
          x2.filter = `blur(${L.blur}px)`;
          x2.drawImage(c, 0, 0);
          c = c2; x = c.getContext('2d');
        }
        // неравномерное освещение: градиент + тень-полоса
        x.globalCompositeOperation = 'multiply';
        const g = x.createLinearGradient(0, 0, W * 0.9, H * 0.6);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, `rgb(${255 * (1 - L.shadow)},${255 * (1 - L.shadow)},${255 * (1 - L.shadow * 0.9)})`);
        x.fillStyle = g;
        x.fillRect(0, 0, W, H);
        if (L.band) {
          const gb = x.createLinearGradient(W * 0.1, H * 0.55, W * 0.55, H * 0.35);
          gb.addColorStop(0, 'rgba(255,255,255,1)');
          gb.addColorStop(0.35, `rgba(${255 * (1 - L.band * 0.6)},${255 * (1 - L.band * 0.6)},${255 * (1 - L.band * 0.55)},1)`);
          gb.addColorStop(0.5, 'rgba(255,255,255,1)');
          x.fillStyle = gb;
          x.fillRect(0, 0, W, H);
        }
        x.globalCompositeOperation = 'source-over';
        // шум сенсора
        if (L.noise) {
          const id = x.getImageData(0, 0, W, H);
          const d = id.data;
          let s = seedN;
          const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
          for (let i = 0; i < d.length; i += 4) {
            const n = (rnd() + rnd() + rnd() - 1.5) * L.noise * 2;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
          }
          x.putImageData(id, 0, 0);
        }
        return c.toDataURL('image/jpeg', L.q).split(',')[1];
      }, [shot, L, 12345]);
    }
    fs.writeFileSync(`photos/${name}_${lv}.jpg`, Buffer.from(jpeg, 'base64'));
  }
}
await browser.close();
