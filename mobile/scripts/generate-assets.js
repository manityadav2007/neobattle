const fs = require('fs');
const path = require('path');
const sharp = require(path.resolve(__dirname, '../../backend/node_modules/sharp'));

const resDir = path.resolve(__dirname, '../android/app/src/main/res');
const logoPath = path.resolve(resDir, 'drawable/neobattle_logo.png');

async function main() {
  console.log('Reading source logo from:', logoPath);
  const logoBuffer = fs.readFileSync(logoPath);

  // 1. Trim transparency so we have the exact bounding box of the shield
  const trimmedLogoBuffer = await sharp(logoBuffer).trim().toBuffer();
  const trimmedMeta = await sharp(trimmedLogoBuffer).metadata();
  console.log('Trimmed shield size:', trimmedMeta.width, 'x', trimmedMeta.height);

  // 2. Prepare monochrome version (pure white with shield alpha mask)
  const { data: rawPixels, info } = await sharp(trimmedLogoBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const whitePixels = Buffer.alloc(rawPixels.length);
  for (let i = 0; i < rawPixels.length; i += 4) {
    whitePixels[i] = 255;     // R
    whitePixels[i + 1] = 255; // G
    whitePixels[i + 2] = 255; // B
    whitePixels[i + 3] = rawPixels[i + 3]; // Alpha from original
  }

  const monochromeBuffer = await sharp(whitePixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  // Densities for mipmaps
  const mipmapDensities = [
    { name: 'mipmap-mdpi', canvas: 48, adaptiveCanvas: 108, factor: 1 },
    { name: 'mipmap-hdpi', canvas: 72, adaptiveCanvas: 162, factor: 1.5 },
    { name: 'mipmap-xhdpi', canvas: 96, adaptiveCanvas: 216, factor: 2 },
    { name: 'mipmap-xxhdpi', canvas: 144, adaptiveCanvas: 324, factor: 3 },
    { name: 'mipmap-xxxhdpi', canvas: 192, adaptiveCanvas: 432, factor: 4 },
  ];

  for (const d of mipmapDensities) {
    const targetFolder = path.join(resDir, d.name);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // A. Adaptive Icon Foreground (60% safe zone inside 108dp canvas)
    const adaptiveSize = d.adaptiveCanvas;
    const fgShieldHeight = Math.round(adaptiveSize * 0.58);
    const fgShieldWidth = Math.round(fgShieldHeight * (trimmedMeta.width / trimmedMeta.height));
    const fgResized = await sharp(trimmedLogoBuffer)
      .resize(fgShieldWidth, fgShieldHeight, { fit: 'contain' })
      .toBuffer();

    await sharp({
      create: {
        width: adaptiveSize,
        height: adaptiveSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: fgResized, gravity: 'center' }])
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));

    // B. Adaptive Icon Monochrome Layer (Themed Icons)
    const monoResized = await sharp(monochromeBuffer)
      .resize(fgShieldWidth, fgShieldHeight, { fit: 'contain' })
      .toBuffer();

    await sharp({
      create: {
        width: adaptiveSize,
        height: adaptiveSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: monoResized, gravity: 'center' }])
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_monochrome.png'));

    // C. Legacy Square Icon (ic_launcher.png)
    const legacySize = d.canvas;
    const legacyShieldHeight = Math.round(legacySize * 0.76);
    const legacyShieldWidth = Math.round(legacyShieldHeight * (trimmedMeta.width / trimmedMeta.height));
    const legacyShield = await sharp(trimmedLogoBuffer)
      .resize(legacyShieldWidth, legacyShieldHeight, { fit: 'contain' })
      .toBuffer();

    await sharp({
      create: {
        width: legacySize,
        height: legacySize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([{ input: legacyShield, gravity: 'center' }])
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher.png'));

    // D. Legacy Round Icon (ic_launcher_round.png)
    const roundShieldHeight = Math.round(legacySize * 0.62);
    const roundShieldWidth = Math.round(roundShieldHeight * (trimmedMeta.width / trimmedMeta.height));
    const roundShield = await sharp(trimmedLogoBuffer)
      .resize(roundShieldWidth, roundShieldHeight, { fit: 'contain' })
      .toBuffer();

    const radius = legacySize / 2;
    const circleSvg = `<svg width="${legacySize}" height="${legacySize}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#000000" /></svg>`;
    const circleBg = await sharp(Buffer.from(circleSvg)).png().toBuffer();

    await sharp(circleBg)
      .composite([{ input: roundShield, gravity: 'center' }])
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_round.png'));

    console.log(`Generated icons for ${d.name} (${adaptiveSize}px adaptive, ${legacySize}px legacy)`);
  }

  // 3. Android 12+ SplashScreen Animated Icon (288dp canvas, <= 60% logo, no background tint)
  const splashDensities = [
    { folder: 'drawable-mdpi', canvas: 288 },
    { folder: 'drawable-hdpi', canvas: 432 },
    { folder: 'drawable-xhdpi', canvas: 576 },
    { folder: 'drawable-xxhdpi', canvas: 864 },
    { folder: 'drawable-xxxhdpi', canvas: 1152 },
  ];

  for (const s of splashDensities) {
    const splashCanvas = s.canvas;
    const logoHeight = Math.round(splashCanvas * 0.52); // ~150dp in 288dp canvas, safely inside 160dp circular mask
    const logoWidth = Math.round(logoHeight * (trimmedMeta.width / trimmedMeta.height));
    const splashLogo = await sharp(trimmedLogoBuffer)
      .resize(logoWidth, logoHeight, { fit: 'contain' })
      .toBuffer();

    const folderPath = path.join(resDir, s.folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Pure black native splash with transparent icon (seamless transition to web loading screen)
    await sharp({
      create: {
        width: splashCanvas,
        height: splashCanvas,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toFile(path.join(folderPath, 'splash_icon_v31.png'));

    console.log(`Generated transparent splash_icon_v31 for ${s.folder} (${splashCanvas}x${splashCanvas})`);
  }

  // Also default splash_icon_v31 in res/drawable (fully transparent)
  await sharp({
    create: {
      width: 576,
      height: 576,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toFile(path.join(resDir, 'drawable/splash_icon_v31.png'));

  // 4. Update ic_launcher_background.xml files
  fs.writeFileSync(
    path.join(resDir, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`
  );

  fs.writeFileSync(
    path.join(resDir, 'drawable/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportHeight="108"\n    android:viewportWidth="108">\n    <path\n        android:fillColor="#000000"\n        android:pathData="M0,0h108v108h-108z" />\n</vector>\n`
  );

  // Remove the old Android robot vector in drawable-v24 if present
  const oldFg = path.join(resDir, 'drawable-v24/ic_launcher_foreground.xml');
  if (fs.existsSync(oldFg)) {
    fs.unlinkSync(oldFg);
    console.log('Removed default Android robot vector in drawable-v24/ic_launcher_foreground.xml');
  }

  // 5. Update mipmap-anydpi-v26 xmls to include monochrome
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n`;
  fs.writeFileSync(path.join(resDir, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptiveXml);
  fs.writeFileSync(path.join(resDir, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptiveXml);

  console.log('All adaptive icons, legacy icons, and Android 12+ splash icons successfully generated!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
