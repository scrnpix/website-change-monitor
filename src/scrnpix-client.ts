import type { Config } from "./config.js";

export interface CaptureParams {
  url: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  format?: "png" | "jpeg";
}

export interface CaptureResult {
  imageBuffer: Buffer;
  contentType: string;
}

export class ScrnpixError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = "ScrnpixError";
  }
}

export class ScrnpixClient {
  private apiUrl: string;
  private apiKey: string;
  private retryConfig: Config["retry"];

  constructor(apiUrl: string, apiKey: string, retryConfig: Config["retry"]) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.retryConfig = retryConfig;
  }

  async captureScreenshot(params: CaptureParams): Promise<CaptureResult> {
    const url = new URL("/screenshot", this.apiUrl);
    url.searchParams.set("url", params.url);

    if (params.width !== undefined && params.width !== 1280) {
      url.searchParams.set("width", String(params.width));
    }
    if (params.height !== undefined && params.height !== 720) {
      url.searchParams.set("height", String(params.height));
    }
    if (params.fullPage) {
      url.searchParams.set("full_page", "true");
    }
    if (params.format && params.format !== "png") {
      url.searchParams.set("format", params.format);
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { "X-KEY": this.apiKey },
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return {
            imageBuffer: Buffer.from(arrayBuffer),
            contentType: response.headers.get("content-type") || "image/png",
          };
        }

        const statusCode = response.status;

        // Non-retryable errors: fail fast
        if (
          statusCode === 400 ||
          statusCode === 401 ||
          statusCode === 402
        ) {
          let errorBody: { error?: string; message?: string } = {};
          try {
            errorBody = (await response.json()) as typeof errorBody;
          } catch {
            // ignore JSON parse failure
          }
          throw new ScrnpixError(
            errorBody.message || errorBody.error || `HTTP ${statusCode}`,
            statusCode,
            errorBody.error,
          );
        }

        // Retryable errors: 429, 500
        if (statusCode === 429 || statusCode >= 500) {
          let retryAfterMs: number | undefined;
          const retryAfterHeader = response.headers.get("retry-after");
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (!isNaN(seconds)) {
              retryAfterMs = seconds * 1000;
            }
          }

          lastError = new ScrnpixError(
            `HTTP ${statusCode}`,
            statusCode,
          );

          if (attempt < this.retryConfig.maxAttempts - 1) {
            const delay = retryAfterMs ?? this.calculateBackoff(attempt);
            await sleep(delay);
            continue;
          }
        }

        // Other unexpected status codes
        lastError = new ScrnpixError(
          `Unexpected HTTP ${statusCode}`,
          statusCode,
        );
      } catch (err) {
        if (err instanceof ScrnpixError && (err.statusCode === 400 || err.statusCode === 401 || err.statusCode === 402)) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.retryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoff(attempt);
          await sleep(delay);
          continue;
        }
      }
    }

    throw lastError || new Error("All retry attempts exhausted");
  }

  private calculateBackoff(attempt: number): number {
    const base = this.retryConfig.initialDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.retryConfig.initialDelayMs;
    return Math.min(base + jitter, this.retryConfig.maxDelayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
