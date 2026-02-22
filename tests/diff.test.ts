import { describe, it, expect, vi } from "vitest";
import { PNG } from "pngjs";
import { compareImages } from "../src/diff.js";

/** Create a solid-color PNG buffer */
function createPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

describe("compareImages", () => {
  it("reports 0% change for identical images", () => {
    const img = createPng(10, 10, 255, 0, 0);
    const result = compareImages(img, img, "image/png", 0.1);

    expect(result.totalPixels).toBe(100);
    expect(result.changedPixels).toBe(0);
    expect(result.changePercentage).toBe(0);
    expect(result.diffImageBuffer).toBeInstanceOf(Buffer);
  });

  it("reports 100% change for completely different images", () => {
    const baseline = createPng(10, 10, 255, 0, 0);
    const latest = createPng(10, 10, 0, 0, 255);
    const result = compareImages(baseline, latest, "image/png", 0.1);

    expect(result.totalPixels).toBe(100);
    expect(result.changedPixels).toBe(100);
    expect(result.changePercentage).toBe(100);
  });

  it("reports partial change correctly", () => {
    // Create a 10x10 image - baseline all red
    const baselinePng = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const idx = i << 2;
      baselinePng.data[idx] = 255;
      baselinePng.data[idx + 1] = 0;
      baselinePng.data[idx + 2] = 0;
      baselinePng.data[idx + 3] = 255;
    }
    const baseline = PNG.sync.write(baselinePng);

    // Latest: first 50 pixels blue, last 50 red (same as baseline)
    const latestPng = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const idx = i << 2;
      if (i < 50) {
        latestPng.data[idx] = 0;
        latestPng.data[idx + 1] = 0;
        latestPng.data[idx + 2] = 255;
      } else {
        latestPng.data[idx] = 255;
        latestPng.data[idx + 1] = 0;
        latestPng.data[idx + 2] = 0;
      }
      latestPng.data[idx + 3] = 255;
    }
    const latest = PNG.sync.write(latestPng);

    const result = compareImages(baseline, latest, "image/png", 0.1);

    expect(result.totalPixels).toBe(100);
    expect(result.changedPixels).toBe(50);
    expect(result.changePercentage).toBe(50);
  });

  it("reports 100% on dimension mismatch", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const baseline = createPng(10, 10, 255, 0, 0);
    const latest = createPng(20, 20, 255, 0, 0);

    const result = compareImages(baseline, latest, "image/png", 0.1);

    expect(result.changePercentage).toBe(100);
    expect(result.totalPixels).toBe(400); // max of 100 and 400
    expect(result.changedPixels).toBe(400);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Dimension mismatch"),
    );

    spy.mockRestore();
  });

  it("produces a valid PNG diff image", () => {
    const baseline = createPng(10, 10, 255, 0, 0);
    const latest = createPng(10, 10, 0, 255, 0);
    const result = compareImages(baseline, latest, "image/png", 0.1);

    // Should be parseable as PNG
    const parsed = PNG.sync.read(result.diffImageBuffer);
    expect(parsed.width).toBe(10);
    expect(parsed.height).toBe(10);
  });

  it("respects threshold parameter", () => {
    // Create two slightly different images
    const baselinePng = new PNG({ width: 10, height: 10 });
    const latestPng = new PNG({ width: 10, height: 10 });
    for (let i = 0; i < 100; i++) {
      const idx = i << 2;
      baselinePng.data[idx] = 100;
      baselinePng.data[idx + 1] = 100;
      baselinePng.data[idx + 2] = 100;
      baselinePng.data[idx + 3] = 255;

      // Slight variation
      latestPng.data[idx] = 105;
      latestPng.data[idx + 1] = 105;
      latestPng.data[idx + 2] = 105;
      latestPng.data[idx + 3] = 255;
    }
    const baseline = PNG.sync.write(baselinePng);
    const latest = PNG.sync.write(latestPng);

    // With high threshold, should see fewer changes
    const strictResult = compareImages(baseline, latest, "image/png", 0.0);
    const lenientResult = compareImages(baseline, latest, "image/png", 0.5);

    expect(strictResult.changedPixels).toBeGreaterThanOrEqual(
      lenientResult.changedPixels,
    );
  });
});
