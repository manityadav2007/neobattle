const path = require('path');
const sharp = require(path.resolve(__dirname, '../../backend/node_modules/sharp'));

async function main() {
  const viewports = [
    { w: 360, h: 640, name: '360x640' },
    { w: 390, h: 844, name: '390x844' },
    { w: 430, h: 932, name: '430x932' },
  ];

  const nativeSplashMdpi = path.resolve(__dirname, '../../mobile/android/app/src/main/res/drawable-mdpi/splash_icon_v31.png');
  const webpPath = path.resolve(__dirname, '../public/app-splash-bg.webp');

  const results = [];

  for (const vp of viewports) {
    const W = vp.w;
    const H = vp.h;
    const screenCx = W / 2;
    const screenCy = H / 2;

    // 1. Native splash rendering on viewport
    const nativeCanvas = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite([{
        input: nativeSplashMdpi,
        left: Math.round(screenCx - 144),
        top: Math.round(screenCy - 144),
      }])
      .raw()
      .toBuffer({ resolveWithObject: true });

    let nMinX = W, nMaxX = 0, nMinY = H, nMaxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const r = nativeCanvas.data[idx];
        const g = nativeCanvas.data[idx + 1];
        const b = nativeCanvas.data[idx + 2];
        const a = nativeCanvas.data[idx + 3];
        if (a > 10 && (r > 15 || g > 15 || b > 15)) {
          if (x < nMinX) nMinX = x;
          if (x > nMaxX) nMaxX = x;
          if (y < nMinY) nMinY = y;
          if (y > nMaxY) nMaxY = y;
        }
      }
    }
    const nW = nMaxX - nMinX + 1;
    const nH = nMaxY - nMinY + 1;
    const nCx = (nMinX + nMaxX) / 2;
    const nCy = (nMinY + nMaxY) / 2;

    // 2. Web art rendering on viewport (540x1080 centered and cropped to viewport)
    const cropLeft = Math.round(270 - screenCx);
    const cropTop = Math.round(540 - screenCy);

    const webCanvas = await sharp(webpPath)
      .resize(540, 1080)
      .extract({ left: cropLeft, top: cropTop, width: W, height: H })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let wMinX = W, wMaxX = 0, wMinY = H, wMaxY = 0;
    const ch = webCanvas.info.channels;
    for (let y = Math.round(screenCy - 75); y <= Math.round(screenCy + 75); y++) {
      for (let x = Math.round(screenCx - 65); x <= Math.round(screenCx + 65); x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const idx = (y * W + x) * ch;
        const r = webCanvas.data[idx];
        const g = webCanvas.data[idx + 1];
        const b = webCanvas.data[idx + 2];
        if ((b > 130 && g > 75) || (r > 160 && g > 85)) {
          if (x < wMinX) wMinX = x;
          if (x > wMaxX) wMaxX = x;
          if (y < wMinY) wMinY = y;
          if (y > wMaxY) wMaxY = y;
        }
      }
    }
    const wW = wMaxX - wMinX + 1;
    const wH = wMaxY - wMinY + 1;
    const wCx = (wMinX + wMaxX) / 2;
    const wCy = (wMinY + wMaxY) / 2;

    const res = {
      viewport: vp.name,
      screenWidth: W,
      screenHeight: H,
      screenCenter: [screenCx, screenCy],
      systemSplash: {
        width: nW,
        height: nH,
        center: [nCx, nCy],
        offsetFromCenter: [nCx - screenCx, nCy - screenCy],
      },
      webArt: {
        width: wW,
        height: wH,
        center: [wCx, wCy],
        offsetFromCenter: [wCx - screenCx, wCy - screenCy],
      },
      difference: {
        dx: wCx - nCx,
        dy: wCy - nCy,
        widthDiff: Math.abs(wW - nW),
        heightDiff: Math.abs(wH - nH),
      },
    };
    results.push(res);
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
