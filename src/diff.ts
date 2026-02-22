import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import * as jpeg from "jpeg-js";

export interface DiffResult {
  totalPixels: number;
  changedPixels: number;
  changePercentage: number;
  diffImageBuffer: Buffer;
}

export function compareImages(
  baselineBuffer: Buffer,
  latestBuffer: Buffer,
  contentType: string,
  threshold: number,
): DiffResult {
  const isJpeg =
    contentType.includes("jpeg") || contentType.includes("jpg");

  const baseline = decodeImage(baselineBuffer, isJpeg);
  const latest = decodeImage(latestBuffer, isJpeg);

  // Dimension mismatch: report 100% changed
  if (baseline.width !== latest.width || baseline.height !== latest.height) {
    console.error(
      `[WARN] Dimension mismatch: baseline=${baseline.width}x${baseline.height}, latest=${latest.width}x${latest.height}`,
    );
    const totalPixels = Math.max(
      baseline.width * baseline.height,
      latest.width * latest.height,
    );
    // Create a 1x1 placeholder diff image
    const placeholderPng = new PNG({ width: 1, height: 1 });
    placeholderPng.data[0] = 255; // R
    placeholderPng.data[1] = 0;   // G
    placeholderPng.data[2] = 0;   // B
    placeholderPng.data[3] = 255; // A
    return {
      totalPixels,
      changedPixels: totalPixels,
      changePercentage: 100,
      diffImageBuffer: PNG.sync.write(placeholderPng),
    };
  }

  const { width, height } = baseline;
  const totalPixels = width * height;

  const diffPng = new PNG({ width, height });

  const changedPixels = pixelmatch(
    baseline.data,
    latest.data,
    diffPng.data,
    width,
    height,
    { threshold },
  );

  const changePercentage =
    totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;

  return {
    totalPixels,
    changedPixels,
    changePercentage: Math.round(changePercentage * 100) / 100,
    diffImageBuffer: PNG.sync.write(diffPng),
  };
}

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function decodeImage(buffer: Buffer, isJpeg: boolean): DecodedImage {
  if (isJpeg) {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  }

  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}
