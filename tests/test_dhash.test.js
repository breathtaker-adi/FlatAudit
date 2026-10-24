import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDHashFromGrayscale72,
  computeDHashFromImageData,
  hammingDistance,
  isDuplicateImage
} from '../extension/lib/dhash.js';

describe('dHash Fingerprinting Engine', () => {
  it('computes consistent 16-hex char dHash from 72-pixel grayscale array', () => {
    // Gradient: strictly decreasing pixel values per row -> all bits 1
    const descending = new Uint8Array(72);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 9; c++) {
        descending[r * 9 + c] = 255 - c * 20;
      }
    }

    const hash = computeDHashFromGrayscale72(descending);
    assert.equal(hash.length, 16);
    // All adjacent comparisons left > right are true -> 64 ones -> ffffffffffffffff
    assert.equal(hash, 'ffffffffffffffff');
  });

  it('computes 0000000000000000 for strictly increasing gradient', () => {
    const ascending = new Uint8Array(72);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 9; c++) {
        ascending[r * 9 + c] = c * 20;
      }
    }

    const hash = computeDHashFromGrayscale72(ascending);
    assert.equal(hash, '0000000000000000');
  });

  it('calculates exact Hamming distance between bit patterns', () => {
    assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
    assert.equal(hammingDistance('ffffffffffffffff', 'ffffffffffffffff'), 0);
    assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
    // 1 hex char difference: '0' (0000) vs '1' (0001) = 1 bit
    assert.equal(hammingDistance('0000000000000000', '0000000000000001'), 1);
    // '0' vs 'f' (1111) = 4 bits
    assert.equal(hammingDistance('0000000000000000', '000000000000000f'), 4);
  });

  it('identifies identical and minorly compressed image variations', () => {
    const baseHash = 'a4c28f1107be924d';
    // 2-bit variation simulating compression artifact
    const compressedHash = 'a4c28f1107be924f'; // last nibble differs by 2 bits
    assert.equal(isDuplicateImage(baseHash, compressedHash, 10), true);

    // Completely distinct image
    const distinctHash = '5b3d70ee98416db2';
    assert.equal(isDuplicateImage(baseHash, distinctHash, 10), false);
  });

  it('computes dHash accurately from simulated RGBA ImageData', () => {
    // 9x8 image = 72 pixels * 4 = 288 bytes RGBA
    const rgba = new Uint8ClampedArray(288);
    for (let i = 0; i < 72; i++) {
      const col = i % 9;
      // High red on left, dropping towards right
      rgba[i * 4] = 200 - col * 20;     // R
      rgba[i * 4 + 1] = 200 - col * 20; // G
      rgba[i * 4 + 2] = 200 - col * 20; // B
      rgba[i * 4 + 3] = 255;            // A
    }

    const hash = computeDHashFromImageData({ data: rgba, width: 9, height: 8 });
    assert.equal(hash, 'ffffffffffffffff');
  });
});
