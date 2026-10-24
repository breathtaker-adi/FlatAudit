/**
 * 64-bit Difference Hash (dHash) and Hamming Distance
 *
 * Algorithm:
 * 1. Convert image to 9x8 grayscale (72 pixels).
 * 2. Compare adjacent horizontal pixels (pixel[x] > pixel[x+1]).
 * 3. 8 rows * 8 comparisons = 64 bits.
 * 4. Convert 64 bits into 16-character hex string.
 */

/**
 * Computes 64-bit dHash from an array of 72 grayscale pixel intensities [0..255]
 * (row-major order: 8 rows of 9 pixels).
 * @param {Uint8Array|number[]} grayPixels - Exactly 72 numbers
 * @returns {string} 16-character hex hash string
 */
export function computeDHashFromGrayscale72(grayPixels) {
  if (!grayPixels || grayPixels.length < 72) {
    throw new Error(`Expected at least 72 grayscale pixels, received ${grayPixels?.length}`);
  }

  let binaryStr = '';
  for (let row = 0; row < 8; row++) {
    const rowOffset = row * 9;
    for (let col = 0; col < 8; col++) {
      const left = grayPixels[rowOffset + col];
      const right = grayPixels[rowOffset + col + 1];
      binaryStr += (left > right) ? '1' : '0';
    }
  }

  // Convert 64-bit binary string to 16-character hex string
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = binaryStr.substring(i, i + 4);
    hex += parseInt(nibble, 2).toString(16);
  }
  return hex.padStart(16, '0');
}

/**
 * Computes dHash from RGBA ImageData (e.g. from Canvas 2D or OffscreenCanvas)
 * Expects 9 width x 8 height ImageData (72 RGBA pixels = 288 bytes).
 * @param {ImageData|{data: Uint8ClampedArray|number[], width: number, height: number}} imageData
 * @returns {string} 16-character hex string
 */
export function computeDHashFromImageData(imageData) {
  if (imageData.width !== 9 || imageData.height !== 8) {
    throw new Error(`ImageData dimensions must be 9x8, got ${imageData.width}x${imageData.height}`);
  }

  const grayPixels = new Uint8Array(72);
  const data = imageData.data;

  for (let i = 0; i < 72; i++) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    // Standard perceptual luminance formula
    grayPixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  return computeDHashFromGrayscale72(grayPixels);
}

/**
 * Browser/Canvas helper to calculate dHash from an HTMLImageElement or ImageBitmap
 * @param {CanvasImageSource} imageSource
 * @returns {string}
 */
export function dhashFromCanvas(imageSource) {
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(9, 8);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
  } else {
    throw new Error('No canvas implementation available in current environment');
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageSource, 0, 0, 9, 8);
  const imgData = ctx.getImageData(0, 0, 9, 8);
  return computeDHashFromImageData(imgData);
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Calculates Hamming distance (number of differing bits) between two 16-char hex dHashes.
 * Distance ranges from 0 (identical) to 64 (inverted).
 * @param {string} hashA
 * @param {string} hashB
 * @returns {number}
 */
export function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== 16 || hashB.length !== 16) {
    throw new Error(`Invalid hash lengths for hamming comparison: ${hashA?.length} vs ${hashB?.length}`);
  }

  let distance = 0;
  for (let i = 0; i < 16; i++) {
    const valA = parseInt(hashA[i], 16);
    const valB = parseInt(hashB[i], 16);
    const xorVal = valA ^ valB;
    distance += NIBBLE_BITS[xorVal];
  }

  return distance;
}

/**
 * Helper to determine if two dHashes indicate duplicate or near-duplicate imagery.
 * Default threshold <= 10 bits difference.
 * @param {string} hashA
 * @param {string} hashB
 * @param {number} [threshold=10]
 * @returns {boolean}
 */
export function isDuplicateImage(hashA, hashB, threshold = 10) {
  return hammingDistance(hashA, hashB) <= threshold;
}
