import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, validateEnv, ConfigError, EnvError } from "../src/config.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-config-test");

function writeConfig(filename: string, content: string): string {
  const filepath = join(TMP_DIR, filename);
  writeFileSync(filepath, content, "utf-8");
  return filepath;
}

const VALID_CONFIG = `
sites:
  - url: "https://example.com"
    name: "Example"

alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"
`;

describe("loadConfig", () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("loads a valid config with defaults", () => {
    const path = writeConfig("valid.yml", VALID_CONFIG);
    const config = loadConfig(path);

    expect(config.sites).toHaveLength(1);
    expect(config.sites[0].url).toBe("https://example.com");
    expect(config.sites[0].name).toBe("Example");
    expect(config.sites[0].viewport.width).toBe(1280);
    expect(config.sites[0].viewport.height).toBe(720);
    expect(config.sites[0].fullPage).toBe(false);
    expect(config.sites[0].format).toBe("png");
    expect(config.diff.threshold).toBe(0.1);
    expect(config.diff.changeThreshold).toBe(0.5);
    expect(config.storage.type).toBe("local");
    expect(config.storage.path).toBe("./snapshots");
    expect(config.retry.maxAttempts).toBe(3);
    expect(config.retry.initialDelayMs).toBe(1000);
    expect(config.retry.maxDelayMs).toBe(30000);
  });

  it("loads config with all fields specified", () => {
    const fullConfig = `
sites:
  - url: "https://example.com"
    name: "Full Example"
    viewport:
      width: 1920
      height: 1080
    fullPage: true
    format: "jpeg"

diff:
  threshold: 0.2
  changeThreshold: 1.0

storage:
  type: "local"
  path: "./my-snapshots"

alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"
  discord:
    webhookUrl: "https://discord.com/api/webhooks/123/abc"

retry:
  maxAttempts: 5
  initialDelayMs: 2000
  maxDelayMs: 60000
`;
    const path = writeConfig("full.yml", fullConfig);
    const config = loadConfig(path);

    expect(config.sites[0].viewport.width).toBe(1920);
    expect(config.sites[0].fullPage).toBe(true);
    expect(config.sites[0].format).toBe("jpeg");
    expect(config.diff.threshold).toBe(0.2);
    expect(config.diff.changeThreshold).toBe(1.0);
    expect(config.storage.path).toBe("./my-snapshots");
    expect(config.alerts.slack?.webhookUrl).toContain("hooks.slack.com");
    expect(config.alerts.discord?.webhookUrl).toContain("discord.com");
    expect(config.retry.maxAttempts).toBe(5);
  });

  it("throws ConfigError for missing file", () => {
    expect(() => loadConfig("/nonexistent/path.yml")).toThrow(ConfigError);
    expect(() => loadConfig("/nonexistent/path.yml")).toThrow(
      "Config file not found",
    );
  });

  it("throws ConfigError for invalid YAML", () => {
    const path = writeConfig("bad.yml", "{{{{invalid yaml");
    expect(() => loadConfig(path)).toThrow(ConfigError);
    expect(() => loadConfig(path)).toThrow("Invalid YAML");
  });

  it("throws ConfigError when no sites configured", () => {
    const noSites = `
sites: []
alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"
`;
    const path = writeConfig("nosites.yml", noSites);
    expect(() => loadConfig(path)).toThrow(ConfigError);
    expect(() => loadConfig(path)).toThrow("Config validation failed");
  });

  it("throws ConfigError when no alert channels configured", () => {
    const noAlerts = `
sites:
  - url: "https://example.com"
alerts: {}
`;
    const path = writeConfig("noalerts.yml", noAlerts);
    expect(() => loadConfig(path)).toThrow(ConfigError);
    expect(() => loadConfig(path)).toThrow("At least one alert channel");
  });

  it("throws ConfigError for invalid site URL", () => {
    const badUrl = `
sites:
  - url: "not-a-url"
alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"
`;
    const path = writeConfig("badurl.yml", badUrl);
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("throws ConfigError for viewport out of range", () => {
    const badViewport = `
sites:
  - url: "https://example.com"
    viewport:
      width: 50
      height: 720
alerts:
  slack:
    webhookUrl: "https://hooks.slack.com/services/T/B/X"
`;
    const path = writeConfig("badviewport.yml", badViewport);
    expect(() => loadConfig(path)).toThrow(ConfigError);
  });

  it("supports multiple sites", () => {
    const multi = `
sites:
  - url: "https://example.com"
    name: "Site A"
  - url: "https://example.org"
    name: "Site B"
alerts:
  discord:
    webhookUrl: "https://discord.com/api/webhooks/123/abc"
`;
    const path = writeConfig("multi.yml", multi);
    const config = loadConfig(path);
    expect(config.sites).toHaveLength(2);
    expect(config.sites[0].name).toBe("Site A");
    expect(config.sites[1].name).toBe("Site B");
  });
});

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns apiKey and default apiUrl", () => {
    process.env.SCRNPIX_API_KEY = "test-key-123";
    delete process.env.SCRNPIX_API_URL;

    const env = validateEnv();
    expect(env.apiKey).toBe("test-key-123");
    expect(env.apiUrl).toBe("https://api.scrnpix.com");
  });

  it("uses custom SCRNPIX_API_URL", () => {
    process.env.SCRNPIX_API_KEY = "test-key";
    process.env.SCRNPIX_API_URL = "https://custom.api.com/";

    const env = validateEnv();
    expect(env.apiUrl).toBe("https://custom.api.com");
  });

  it("throws EnvError when SCRNPIX_API_KEY is missing", () => {
    delete process.env.SCRNPIX_API_KEY;

    expect(() => validateEnv()).toThrow(EnvError);
    expect(() => validateEnv()).toThrow("SCRNPIX_API_KEY");
  });
});
