const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function processAssets() {
  const iconSrc = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/.user_uploaded/media_1794388944860_561ab287.jpg';
  const logoSrc = 'C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/.user_uploaded/media_1794388944897_b17ef812.png';

  console.log('Reading icon source:', iconSrc);
  const iconRaw = await sharp(iconSrc).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = iconRaw.info;
  const rawData = iconRaw.data;
  const rgba = Buffer.alloc(width * height * 4);

  // Flood fill from corners to find black background
  const visited = new Uint8Array(width * height);
  const queue = [0, width - 1, (height - 1) * width, (height - 1) * width + width - 1];
  queue.forEach(idx => (visited[idx] = 1));
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % width;
    const cy = Math.floor(curr / width);
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!visited[nidx]) {
          const rawIdx = nidx * 3;
          const r = rawData[rawIdx];
          const g = rawData[rawIdx + 1];
          const b = rawData[rawIdx + 2];
          if (r <= 12 && g <= 12 && b <= 18) {
            visited[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const rawIdx = i * 3;
    const outIdx = i * 4;
    rgba[outIdx] = rawData[rawIdx];
    rgba[outIdx + 1] = rawData[rawIdx + 1];
    rgba[outIdx + 2] = rawData[rawIdx + 2];
    rgba[outIdx + 3] = visited[i] ? 0 : 255;
  }

  // Find bounding box
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const side = Math.max(maxX - minX + 1, maxY - minY + 1);
  const centerX = Math.round((minX + maxX) / 2);
  const centerY = Math.round((minY + maxY) / 2);
  const cropLeft = Math.max(0, centerX - Math.floor(side / 2));
  const cropTop = Math.max(0, centerY - Math.floor(side / 2));
  const cropWidth = Math.min(width - cropLeft, side);
  const cropHeight = Math.min(height - cropTop, side);

  console.log('Cropping icon squircle:', { cropLeft, cropTop, cropWidth, cropHeight });
  const croppedIconBuffer = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // Save logo-icon.png (192x192)
  const icon192 = await sharp(croppedIconBuffer).resize(192, 192).png().toBuffer();
  fs.writeFileSync('apps/web/public/logo-icon.png', icon192);
  fs.writeFileSync('apps/web/src/assets/logo-icon.png', icon192);
  fs.writeFileSync('apps/api/assets/logo-icon.png', icon192);
  console.log('Saved logo-icon.png in public, src/assets, and api/assets');

  // Save favicon.png (64x64) and favicon-32x32.png (32x32)
  const fav64 = await sharp(croppedIconBuffer).resize(64, 64).png().toBuffer();
  fs.writeFileSync('apps/web/public/favicon.png', fav64);
  const fav32 = await sharp(croppedIconBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync('apps/web/public/favicon-32x32.png', fav32);
  console.log('Saved favicon.png and favicon-32x32.png');

  // Save favicon.svg
  const favB64 = fav64.toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">\n  <image width="64" height="64" href="data:image/png;base64,${favB64}" />\n</svg>\n`;
  fs.writeFileSync('apps/web/public/favicon.svg', svgContent);
  fs.writeFileSync('apps/api/assets/favicon.svg', svgContent);
  fs.writeFileSync('apps/api/assets/logo-icon.svg', svgContent);
  console.log('Saved favicon.svg');

  // Save favicon.ico (16, 32, 48)
  const png16 = await sharp(croppedIconBuffer).resize(16, 16).png().toBuffer();
  const png32 = fav32;
  const png48 = await sharp(croppedIconBuffer).resize(48, 48).png().toBuffer();
  const images = [
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 }
  ];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + (images.length * 16);
  const dirEntries = [];
  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width, 0);
    entry.writeUInt8(img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.buffer.length;
    dirEntries.push(entry);
  }
  const icoBuffer = Buffer.concat([header, ...dirEntries, ...images.map(img => img.buffer)]);
  fs.writeFileSync('apps/web/public/favicon.ico', icoBuffer);
  console.log('Saved favicon.ico in public');

  // 2. Process Logo Light (JNC CRM)
  console.log('Reading logo source:', logoSrc);
  const logoBuffer = await sharp(logoSrc).png().toBuffer();
  fs.writeFileSync('apps/web/public/logo.png', logoBuffer);
  fs.writeFileSync('apps/web/src/assets/logo.png', logoBuffer);
  fs.writeFileSync('apps/api/assets/logo.png', logoBuffer);
  fs.writeFileSync('apps/api/assets/logo.jpg', logoBuffer);
  fs.writeFileSync('apps/api/assets/jnc-logo.jpg', logoBuffer);
  fs.writeFileSync('apps/web/src/assets/jnc-logo.jpg', logoBuffer);
  console.log('Saved logo.png in public, src/assets, and api/assets');

  // 3. Process Logo Dark (white text for dark backgrounds)
  const logoRaw = await sharp(logoSrc).raw().toBuffer({ resolveWithObject: true });
  const lWidth = logoRaw.info.width;
  const lHeight = logoRaw.info.height;
  const lData = Buffer.from(logoRaw.data);
  for (let y = 0; y < lHeight; y++) {
    for (let x = 360; x < lWidth; x++) {
      const idx = (y * lWidth + x) * 4;
      const a = lData[idx + 3];
      if (a > 0) {
        lData[idx] = 255;
        lData[idx + 1] = 255;
        lData[idx + 2] = 255;
      }
    }
  }
  const logoDarkBuffer = await sharp(lData, { raw: { width: lWidth, height: lHeight, channels: 4 } })
    .png()
    .toBuffer();
  fs.writeFileSync('apps/web/public/logo-dark.png', logoDarkBuffer);
  fs.writeFileSync('apps/web/src/assets/logo-dark.png', logoDarkBuffer);
  console.log('Saved logo-dark.png in public and src/assets');

  console.log('ALL BRAND ASSETS GENERATED SUCCESSFULLY!');
}

processAssets().catch((err) => {
  console.error(err);
  process.exit(1);
});
