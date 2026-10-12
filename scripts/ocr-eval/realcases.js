// «Фото как в жизни»: из чистых страниц делает снимки с телефона в разных плохих условиях.
// Скрипт выполняется ВНУТРИ страницы Chromium (его подкладывает e2e/v130-textbook-real.mjs через addScriptTag).
// window.RC.make(id, { physics, biology }) → base64 JPEG. Всё детерминировано (семя), чтобы замеры «до/после» были сравнимы.
(function () {
  const rngOf = (seed) => {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const loadImg = async (b64) => {
    const im = new Image();
    im.src = 'data:image/png;base64,' + b64;
    await im.decode();
    return im;
  };

  // ---- Гомография (3×3) по четырём точкам ----
  function solve(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }
  function homography(src, dst) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i];
      const [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    const h = solve(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  const apply = (m, x, y) => {
    const w = m[6] * x + m[7] * y + m[8];
    return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
  };

  /** Положение страницы в кадре: центр, масштаб, повороты (градусы), перспектива. */
  function pose(sw, sh, o) {
    const rad = (d) => (d * Math.PI) / 180;
    const f = o.focal || 2600; // «фокусное» в пикселях кадра
    const pts = [[-sw / 2, -sh / 2], [sw / 2, -sh / 2], [sw / 2, sh / 2], [-sw / 2, sh / 2]].map(([x, y]) => {
      let X = x * o.scale, Y = y * o.scale, Z = 0;
      // вокруг оси X (наклон «от себя»), Y (вбок), Z (в плоскости кадра)
      const cx = Math.cos(rad(o.rx || 0)), sx = Math.sin(rad(o.rx || 0));
      [Y, Z] = [Y * cx - Z * sx, Y * sx + Z * cx];
      const cy = Math.cos(rad(o.ry || 0)), sy = Math.sin(rad(o.ry || 0));
      [X, Z] = [X * cy + Z * sy, -X * sy + Z * cy];
      const cz = Math.cos(rad(o.rz || 0)), sz = Math.sin(rad(o.rz || 0));
      [X, Y] = [X * cz - Y * sz, X * sz + Y * cz];
      const k = f / (f + Z);
      return [o.cx + X * k, o.cy + Y * k];
    });
    return { corners: pts, H: homography([[0, 0], [sw, 0], [sw, sh], [0, sh]], pts) };
  }

  /** Страница на столе: обратное отображение каждого пикселя кадра. warp(u,v) → [u',v'] — изгиб бумаги. */
  function renderOnDesk(page, W, H, o, rnd) {
    const sw = page.width, sh = page.height;
    const { corners, H: Hm } = pose(sw, sh, o);
    const Hi = inv3(Hm);
    const out = mk(W, H);
    const ctx = out.getContext('2d');
    const sctx = page.getContext('2d', { willReadFrequently: true });
    const sp = sctx.getImageData(0, 0, sw, sh).data;
    const dst = ctx.createImageData(W, H);
    const d = dst.data;
    const [dr, dg, db] = o.desk || [112, 84, 56];
    const grain = new Float32Array(64);
    for (let i = 0; i < 64; i++) grain[i] = (rnd() - 0.5) * 18;
    const warp = o.warp;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const wq = Hi[6] * x + Hi[7] * y + Hi[8];
        let u = (Hi[0] * x + Hi[1] * y + Hi[2]) / wq;
        let v = (Hi[3] * x + Hi[4] * y + Hi[5]) / wq;
        if (warp) [u, v] = warp(u, v);
        const i = (y * W + x) * 4;
        if (u >= 0 && v >= 0 && u < sw - 1 && v < sh - 1) {
          const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
          const p = (y0 * sw + x0) * 4;
          for (let c = 0; c < 3; c++) {
            const a = sp[p + c] * (1 - fx) + sp[p + 4 + c] * fx;
            const b = sp[p + sw * 4 + c] * (1 - fx) + sp[p + sw * 4 + 4 + c] * fx;
            d[i + c] = a * (1 - fy) + b * fy;
          }
        } else {
          // стол: волокна дерева + тень от страницы
          const dx = Math.max(-u, u - sw, 0), dy = Math.max(-v, v - sh, 0);
          const dist = Math.hypot(dx, dy) * o.scale;
          const sh_ = 1 - 0.45 * Math.exp(-dist / 55);
          const g = grain[((y >> 3) + (x >> 9)) & 63] + Math.sin(y * 0.05 + Math.sin(x * 0.004) * 6) * 7;
          d[i] = (dr + g) * sh_;
          d[i + 1] = (dg + g * 0.8) * sh_;
          d[i + 2] = (db + g * 0.6) * sh_;
        }
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(dst, 0, 0);
    return { canvas: out, corners };
  }

  // ---- Освещение и дефекты поверх готового кадра ----
  /** light(x, y, W, H) → [kr, kg, kb] множители; add(x, y) → прибавка (блик). */
  function postFx(src, fx, rnd) {
    const W = src.width, H = src.height;
    let c = src;
    if (fx.blur) {
      const c2 = mk(W, H);
      const x2 = c2.getContext('2d');
      x2.filter = `blur(${fx.blur}px)`;
      x2.drawImage(c, 0, 0);
      c = c2;
    }
    if (fx.motion) {
      const c2 = mk(W, H);
      const x2 = c2.getContext('2d');
      const n = fx.motion;
      for (let i = 0; i < n; i++) {
        x2.globalAlpha = 1 / (i + 1);
        x2.drawImage(c, i - n / 2, 0);
      }
      c = c2;
    }
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data;
    const sig = fx.noise || 0;
    const cast = fx.cast || [1, 1, 1];
    const gain = fx.gain ?? 1;
    const gamma = fx.gamma ?? 1;
    const mo = fx.moire;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let k = gain;
        if (fx.light) k *= fx.light(x, y, W, H);
        let add = fx.glare ? fx.glare(x, y) : 0;
        let nz = 0;
        if (sig) nz = (rnd() + rnd() + rnd() - 1.5) * sig * 2;
        let mr = 1, mg = 1, mb = 1;
        if (mo) {
          const t1 = (x * Math.cos(mo.ang) + y * Math.sin(mo.ang)) / mo.period;
          const t2 = (x * Math.cos(mo.ang + 0.07) + y * Math.sin(mo.ang + 0.07)) / (mo.period * 1.04);
          const m = (0.5 + 0.5 * Math.sin(2 * Math.PI * t1)) * (0.5 + 0.5 * Math.sin(2 * Math.PI * t2));
          mr = 1 - mo.amp * m;
          mg = 1 - mo.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t1 + 0.33)));
          mb = 1 - mo.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t1 + 0.66)));
        }
        for (let ch = 0; ch < 3; ch++) {
          let v = d[i + ch] / 255;
          v = Math.pow(v, gamma) * 255;
          v = v * k * cast[ch] * (ch === 0 ? mr : ch === 1 ? mg : mb) + add + nz;
          d[i + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
      }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  function fingers(canvas, corners, rnd, sw) {
    const ctx = canvas.getContext('2d');
    const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const spots = [mid(corners[0], corners[3], 0.38), mid(corners[1], corners[2], 0.62), mid(corners[3], corners[2], 0.2)];
    for (const [x, y] of spots) {
      const g = ctx.createRadialGradient(x, y, 10, x, y, 150);
      g.addColorStop(0, 'rgb(236,188,156)');
      g.addColorStop(0.8, 'rgb(212,158,128)');
      g.addColorStop(1, 'rgb(196,140,112)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 85, 150, 0.25 + rnd() * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,230,220,.55)';
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 70, 36, 22, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Две страницы разворотом: корешок посередине, тень у сгиба.
  function makeSpread(left, right, o) {
    const w = left.width, h = left.height;
    const c = mk(w * 2, h);
    const x = c.getContext('2d');
    x.drawImage(left, 0, 0);
    x.drawImage(right, w, 0);
    const id = x.getImageData(0, 0, w * 2, h);
    const d = id.data;
    const R = o.shadowW || 130;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w * 2; xx++) {
        const dd = Math.abs(xx - w);
        let k = 1 - (o.shadow ?? 0.55) * Math.exp(-((dd / R) * (dd / R)));
        if (dd < 3) k *= 0.5;
        const i = (yy * w * 2 + xx) * 4;
        d[i] *= k;
        d[i + 1] *= k;
        d[i + 2] *= k;
      }
    x.putImageData(id, 0, 0);
    return c;
  }

  const DESK_LIGHT = [196, 190, 178];
  const base = { cx: 1200, cy: 1600, scale: 1.18, rx: 0, ry: 0, rz: 0 };

  // Описание случаев. warn — должно ли приложение честно предупредить, если страницу прочитать плохо.
  const CASES = {
    base_ok: { desc: 'обычный снимок со стола (контроль)', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { noise: 4 } } },
    spread_flat: { desc: 'разворот: две страницы, корешок и тень', pages: ['physics', 'biology'], spread: { shadow: 0.55 }, pose: { ...base, cx: 1600, cy: 1200, scale: 0.98, rz: 1.5 }, fx: { noise: 4 }, frame: [3200, 2400] },
    spread_curved: { desc: 'разворот с сильным изгибом у корешка', pages: ['physics', 'biology'], spread: { shadow: 0.6 }, warpSpread: 55, pose: { ...base, cx: 1600, cy: 1200, scale: 0.98, rz: -2 }, fx: { noise: 5 }, frame: [3200, 2400] },
    spread_angle: { desc: 'разворот, снят под углом (трапеция)', pages: ['physics', 'biology'], spread: { shadow: 0.5 }, pose: { ...base, cx: 1600, cy: 1200, scale: 0.9, rx: 14, ry: 12, rz: 3 }, fx: { noise: 5 }, frame: [3200, 2400] },
    curl_wave: { desc: '«волна»: строки изогнуты по ширине', pages: ['physics'], warp: (sw, sh) => (u, v) => [u, v + 20 * Math.sin((u / sw) * Math.PI * 3.1)], single: { pose: { ...base, rz: 1 }, fx: { noise: 4 } } },
    curl_bulge: { desc: 'выпуклость у корешка: строки веером', pages: ['physics'], warp: (sw, sh) => (u, v) => { const t = Math.max(0, 1 - u / (sw * 0.55)); return [u, v + 70 * t * t * ((v - sh / 2) / (sh / 2))]; }, single: { pose: { ...base, rz: 1 }, fx: { noise: 4, light: (x, y, W) => 0.7 + 0.3 * Math.min(1, x / (W * 0.4)) } } },
    dark: { desc: 'тёмный кадр (мало света)', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { gain: 0.26, noise: 7 } }, warn: true },
    over: { desc: 'пересвет (белёсый кадр)', pages: ['physics'], single: { pose: { ...base, rz: -2 }, fx: { gain: 1.0, gamma: 0.42, noise: 3 } }, warn: true },
    uneven: { desc: 'неровный свет: тень руки и телефона', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { noise: 5, light: (x, y, W, H) => { const a = Math.exp(-(((x - W * 0.35) / (W * 0.22)) ** 2 + ((y - H * 0.4) / (H * 0.18)) ** 2)); const g = 0.55 + 0.45 * (1 - y / H); return g * (1 - 0.62 * a); } } } },
    glare: { desc: 'блик лампы на глянцевой бумаге', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { noise: 4, glare: (x, y) => 230 * Math.exp(-(((x - 1450) / 330) ** 2 + ((y - 1250) / 230) ** 2)) } }, warn: true },
    warm: { desc: 'жёлтый тёплый свет', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { cast: [1, 0.82, 0.48], noise: 5, gain: 0.85 } } },
    noisy: { desc: 'вечер: тёмно и шумно', pages: ['physics'], single: { pose: { ...base, rz: -1 }, fx: { gain: 0.45, noise: 26 } }, warn: true },
    persp: { desc: 'сильная перспектива (трапеция)', pages: ['physics'], single: { pose: { ...base, rx: 26, ry: 20, rz: 2, scale: 1.0 }, fx: { noise: 4 } } },
    rot8: { desc: 'поворот в кадре на 8°', pages: ['physics'], single: { pose: { ...base, rz: 8 }, fx: { noise: 4 } } },
    rot15: { desc: 'поворот в кадре на 15°', pages: ['physics'], single: { pose: { ...base, rz: -15 }, fx: { noise: 4 } } },
    rot90: { desc: 'снимок лёг на бок (90°)', pages: ['physics'], single: { pose: { ...base, scale: 1.05, rz: 90 }, fx: { noise: 4 } } },
    rot180: { desc: 'снимок вверх ногами (180°)', pages: ['physics'], single: { pose: { ...base, rz: 180 }, fx: { noise: 4 } } },
    small_fingers: { desc: 'страница занимает пол-кадра, пальцы по краям', pages: ['physics'], single: { pose: { ...base, scale: 0.78, rz: 4 }, fx: { noise: 5 }, fingers: true }, warn: true },
    blur_light: { desc: 'лёгкая расфокусировка', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { blur: 2, noise: 4 } } },
    blur_defocus: { desc: 'расфокус (не навёлся)', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { blur: 3.6, noise: 4 } }, warn: true },
    blur_motion: { desc: 'смаз (дрогнула рука)', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { motion: 10, noise: 4 } }, warn: true },
    moire: { desc: 'снимок экрана монитора (муар)', pages: ['physics'], single: { pose: { ...base, scale: 1.1, rz: 1, desk: [20, 22, 28] }, fx: { noise: 3, moire: { period: 3.6, ang: 0.12, amp: 0.34 } } }, warn: true },
    lowres_2mp: { desc: 'старый телефон, ~2 Мп', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { noise: 4 } }, down: [1200, 1600] },
    lowres_1mp: { desc: 'совсем мелко, ~1 Мп', pages: ['physics'], single: { pose: { ...base, rz: 2 }, fx: { noise: 4 } }, down: [780, 1040], warn: true }
  };

  async function make(id, imgs) {
    const spec = CASES[id];
    const rnd = rngOf(1234 + id.length * 77);
    const pg = await Promise.all(spec.pages.map((n) => loadImg(imgs[n])));
    const toCanvas = (im) => {
      const c = mk(im.naturalWidth, im.naturalHeight);
      c.getContext('2d').drawImage(im, 0, 0);
      return c;
    };
    let page = toCanvas(pg[0]);
    let poseO, fx, warp;
    const [W, H] = spec.frame || [2400, 3200];
    if (spec.spread) {
      page = makeSpread(page, toCanvas(pg[1]), spec.spread);
      poseO = spec.pose;
      fx = spec.fx;
      if (spec.warpSpread) {
        const A = spec.warpSpread, sw = page.width, sh = page.height, R = sw * 0.5;
        warp = (u, v) => {
          const dd = Math.abs(u - sw / 2) / R;
          const g = Math.max(0, 1 - dd);
          return [u, v + A * g * g * ((v - sh / 2) / (sh / 2))];
        };
      }
    } else {
      poseO = spec.single.pose;
      fx = spec.single.fx;
      if (spec.warp) warp = spec.warp(page.width, page.height);
    }
    const { canvas, corners } = renderOnDesk(page, W, H, { ...poseO, warp }, rnd);
    if (spec.single && spec.single.fingers) fingers(canvas, corners, rnd, page.width);
    let out = postFx(canvas, fx, rnd);
    if (spec.down) {
      // телефон с малым числом пикселей: картинка целиком уменьшена, дальше просто JPEG
      const c2 = mk(spec.down[0], spec.down[1]);
      const x2 = c2.getContext('2d');
      x2.imageSmoothingQuality = 'high';
      x2.drawImage(out, 0, 0, c2.width, c2.height);
      out = c2;
    }
    return out.toDataURL('image/jpeg', 0.8).split(',')[1];
  }
  window.RC = { make, CASES: Object.fromEntries(Object.entries(CASES).map(([k, v]) => [k, { desc: v.desc, pages: v.pages, warn: !!v.warn }])) };
})();
