const fs = require('fs');

// Helper to create a valid PNG buffer of specified size with proper PNG signature and chunks
function createValidPng(targetBytes) {
  // 1x1 transparent PNG base
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // 8 bytes
  // IHDR chunk: length 13, type 'IHDR', data, CRC
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, // bit depth: 8
    0x06, // color type: 6 (RGBA)
    0x00, // compression method: 0
    0x00, // filter method: 0
    0x00  // interlace method: 0
  ]);
  const ihdrLen = Buffer.from([0x00, 0x00, 0x00, 0x0d]);
  const ihdrType = Buffer.from('IHDR', 'ascii');
  // Simple CRC placeholder for IHDR
  const ihdrCrc = Buffer.from([0x5c, 0x72, 0xa8, 0x66]);
  const ihdrChunk = Buffer.concat([ihdrLen, ihdrType, ihdrData, ihdrCrc]);

  // IDAT chunk (1x1 transparent RGBA pixel)
  const idatData = Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(idatData.length);
  const idatType = Buffer.from('IDAT', 'ascii');
  const idatCrc = Buffer.from([0x0d, 0x0a, 0x2d, 0xb4]);
  const idatChunk = Buffer.concat([idatLen, idatType, idatData, idatCrc]);

  // IEND chunk
  const iendChunk = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  // If we need padding, insert a valid 'tEXt' chunk before IEND
  const currentLen = header.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  if (targetBytes > currentLen) {
    const textDataLen = targetBytes - currentLen - 12; // 12 bytes for length, type, CRC
    if (textDataLen > 0) {
      const textType = Buffer.from('tEXt', 'ascii');
      const textData = Buffer.alloc(textDataLen, 'X');
      // Keyword: 'Comment\0'
      Buffer.from('Comment\0').copy(textData, 0);
      const textLen = Buffer.alloc(4);
      textLen.writeUInt32BE(textData.length);
      const textCrc = Buffer.alloc(4); // dummy CRC
      const textChunk = Buffer.concat([textLen, textType, textData, textCrc]);
      return Buffer.concat([header, ihdrChunk, textChunk, idatChunk, iendChunk]);
    }
  }

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

const b = createValidPng(400 * 1024);
console.log('Generated PNG bytes:', b.length, 'Signature:', b.slice(0, 8).toString('hex'));
