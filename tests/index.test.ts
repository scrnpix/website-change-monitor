import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import nock from "nock";
import { run } from "../src/index.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-index-test");
const SNAPSHOTS_DIR = join(TMP_DIR, "snapshots");
const CONFIG_PATH = join(TMP_DIR, "monitor.config.yml");

const API_URL = "https://api.scrnpix.com";

function createPngBuffer(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function writeConfigFile(config: string): void {
  writeFileSync(CONFIG_PATH, config, "utf-8");
}

const BASE_CONFIG = `
sites:
  - url: "https://example.com"
    name: "Example"

diff:
  threshold: 0.1
  changeThreshold: 0.5

storage:
  type: "local"
  path: "${SNAPSHOTS_DIR}"

alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"

retry:
  maxAttempts: 1
  initialDelayMs: 1
  maxDelayMs: 1
`;

describe("run (orchestrator)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SCRNPIX_API_KEY = "test-key";
    process.env.SCRNPIX_API_URL = API_URL;
    mkdirSync(TMP_DIR, { recursive: true });
    nock.cleanAll();
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(TMP_DIR, { recursive: true, force: true });
    nock.cleanAll();
  });

  it("prints help and returns 0", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await run(["--help"]);
    expect(code).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    spy.mockRestore();
  });

  it("returns 1 for missing config file", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await run(["--config", "/nonexistent/config.yml"]);
    expect(code).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Config file not found"),
    );
    spy.mockRestore();
  });

  it("returns 1 for missing SCRNPIX_API_KEY", async () => {
    delete process.env.SCRNPIX_API_KEY;
    writeConfigFile(BASE_CONFIG);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await run(["--config", CONFIG_PATH]);
    expect(code).toBe(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("SCRNPIX_API_KEY"),
    );
    spy.mockRestore();
  });

  it("establishes baseline on first run", async () => {
    writeConfigFile(BASE_CONFIG);
    const pngBuf = createPngBuffer(10, 10, 255, 0, 0);

    nock(API_URL)
      .get("/screenshot")
      .query(true)
      .reply(200, pngBuf, { "content-type": "image/png" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--config", CONFIG_PATH]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("establishing baseline"),
    );

    logSpy.mockRestore();
  });

  it("detects change above threshold and sends alert", async () => {
    writeConfigFile(BASE_CONFIG);

    // First establish baseline
    const baselinePng = createPngBuffer(10, 10, 255, 0, 0);
    const siteDir = join(SNAPSHOTS_DIR, "example");
    mkdirSync(siteDir, { recursive: true });
    writeFileSync(join(siteDir, "baseline.png"), baselinePng);

    // Latest: completely different color
    const latestPng = createPngBuffer(10, 10, 0, 0, 255);
    nock(API_URL)
      .get("/screenshot")
      .query(true)
      .reply(200, latestPng, { "content-type": "image/png" });

    // Slack webhook
    nock("https://hooks.slack.com")
      .post("/services/T/B/X")
      .reply(200, "ok");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--config", CONFIG_PATH]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds change threshold"),
    );

    logSpy.mockRestore();
  });

  it("promotes to baseline when below threshold", async () => {
    writeConfigFile(BASE_CONFIG);

    // Baseline: same image
    const samePng = createPngBuffer(10, 10, 255, 0, 0);
    const siteDir = join(SNAPSHOTS_DIR, "example");
    mkdirSync(siteDir, { recursive: true });
    writeFileSync(join(siteDir, "baseline.png"), samePng);

    nock(API_URL)
      .get("/screenshot")
      .query(true)
      .reply(200, samePng, { "content-type": "image/png" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--config", CONFIG_PATH]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("promoting to baseline"),
    );

    logSpy.mockRestore();
  });

  it("returns 1 and aborts on 401 from Scrnpix", async () => {
    writeConfigFile(BASE_CONFIG);

    nock(API_URL)
      .get("/screenshot")
      .query(true)
      .reply(401, { error: "invalid_api_key", message: "Unauthorized" });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--config", CONFIG_PATH]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("aborting all sites"),
    );

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("skips site on 400 and continues", async () => {
    const twoSiteConfig = `
sites:
  - url: "https://bad.example.com"
    name: "Bad Site"
  - url: "https://good.example.com"
    name: "Good Site"

diff:
  threshold: 0.1
  changeThreshold: 0.5

storage:
  type: "local"
  path: "${SNAPSHOTS_DIR}"

alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"

retry:
  maxAttempts: 1
  initialDelayMs: 1
  maxDelayMs: 1
`;
    writeConfigFile(twoSiteConfig);

    // First site fails with 400
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://bad.example.com" })
      .reply(400, { error: "url_not_public", message: "URL is not publicly accessible" });

    // Second site succeeds
    const pngBuf = createPngBuffer(10, 10, 255, 0, 0);
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://good.example.com" })
      .reply(200, pngBuf, { "content-type": "image/png" });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--config", CONFIG_PATH]);
    // hasFailure=true because first site failed
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process "Bad Site"'),
    );
    // But second site should still have been processed
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Processing "Good Site"'),
    );

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("returns 1 for unknown CLI args", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = await run(["--unknown-flag"]);
    expect(code).toBe(1);

    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
