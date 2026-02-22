declare module "pixelmatch" {
  interface PixelmatchOptions {
    threshold?: number;
    includeAA?: boolean;
    alpha?: number;
    aaColor?: [number, number, number];
    diffColor?: [number, number, number];
    diffColorAlt?: [number, number, number];
    diffMask?: boolean;
  }

  function pixelmatch(
    img1: Uint8Array | Buffer,
    img2: Uint8Array | Buffer,
    output: Uint8Array | Buffer | null,
    width: number,
    height: number,
    options?: PixelmatchOptions,
  ): number;

  export default pixelmatch;
}

declare module "pngjs" {
  import { Readable, Writable } from "node:stream";

  interface PNGOptions {
    width?: number;
    height?: number;
    fill?: boolean;
    checkCRC?: boolean;
    deflateChunkSize?: number;
    deflateLevel?: number;
    deflateStrategy?: number;
    filterType?: number | number[];
    colorType?: number;
    inputColorType?: number;
    bitDepth?: number;
    inputHasAlpha?: boolean;
    bgColor?: { red: number; green: number; blue: number };
  }

  class PNG extends Readable {
    constructor(options?: PNGOptions);
    width: number;
    height: number;
    data: Buffer;
    gamma: number;

    static sync: {
      read(buffer: Buffer, options?: PNGOptions): PNG;
      write(png: PNG, options?: PNGOptions): Buffer;
    };

    pack(): Writable;
    parse(data: Buffer, callback?: (error: Error, data: PNG) => void): PNG;
    on(event: string, callback: (...args: unknown[]) => void): this;
  }

  export { PNG };
}

declare module "jpeg-js" {
  interface DecodedJpeg {
    width: number;
    height: number;
    data: Uint8Array | Buffer;
  }

  interface DecodeOptions {
    useTArray?: boolean;
    colorTransform?: boolean;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
    maxResolutionInMP?: number;
    maxMemoryUsageInMB?: number;
  }

  export function decode(
    jpegData: Buffer | Uint8Array,
    opts?: DecodeOptions,
  ): DecodedJpeg;

  export function encode(
    imgData: { width: number; height: number; data: Buffer | Uint8Array },
    quality?: number,
  ): { width: number; height: number; data: Buffer };
}
