import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { qrSvg } from "../public/qr-code.js";

const decoder = { self: {} };
runInNewContext(await readFile(new URL("../public/vendor/jsQR.js", import.meta.url), "utf8"), decoder);

// Render the horizontal module runs to RGBA so the independent jsQR reader
// can verify the complete payload, including both link types and Unicode.
function raster(svg) {
  const units = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
  const scale = 5;
  const width = units * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, length] = match.slice(1).map(Number);
    assert.ok(x >= 4 && y >= 4 && x + length <= units - 4 && y < units - 4);
    for (let row = y * scale; row < (y + 1) * scale; row++) {
      for (let col = x * scale; col < (x + length) * scale; col++) {
        const offset = (row * width + col) * 4;
        data.fill(0, offset, offset + 3);
      }
    }
  }
  return decoder.self.jsQR(data, width, width)?.data;
}

for (const [label, value] of [
  ["public card", "https://partie.example/carte/AC20360001/C1"],
  ["private entry", "https://partie.example/#code=AC20360001&id=C1&key=fixture-private-test-only"],
  ["accented name and reserved characters", "Prévention · Namur 🌳 <x>&\""],
]) {
  test("QR round trip: " + label, () => {
    const svg = qrSvg(value);
    assert.ok(!svg.includes(value));
    assert.equal(raster(svg), value);
  });
}
