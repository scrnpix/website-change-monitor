import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const SiteSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  viewport: z
    .object({
      width: z.number().int().min(100).max(4000).default(1280),
      height: z.number().int().min(100).max(4000).default(720),
    })
    .default({}),
  fullPage: z.boolean().default(false),
  format: z.enum(["png", "jpeg"]).default("png"),
});

const DiffSchema = z.object({
  threshold: z.number().min(0).max(1).default(0.1),
  changeThreshold: z.number().min(0).max(100).default(0.5),
});

const StorageSchema = z.object({
  type: z.literal("local").default("local"),
  path: z.string().default("./snapshots"),
});

const AlertsSchema = z
  .object({
    slack: z
      .object({
        webhookUrl: z.string().url(),
      })
      .optional(),
    discord: z
      .object({
        webhookUrl: z.string().url(),
      })
      .optional(),
  })
  .refine((alerts) => alerts.slack || alerts.discord, {
    message: "At least one alert channel (slack or discord) must be configured",
  });

const RetrySchema = z.object({
  maxAttempts: z.number().int().min(1).default(3),
  initialDelayMs: z.number().int().min(0).default(1000),
  maxDelayMs: z.number().int().min(0).default(30000),
});

const ConfigSchema = z.object({
  sites: z.array(SiteSchema).min(1, "At least one site must be configured"),
  diff: DiffSchema.default({}),
  storage: StorageSchema.default({}),
  alerts: AlertsSchema,
  retry: RetrySchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type SiteConfig = z.infer<typeof SiteSchema>;

export function loadConfig(configPath: string = "monitor.config.yml"): Config {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ConfigError(`Config file not found: ${configPath}`);
    }
    throw new ConfigError(
      `Failed to read config file: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ConfigError(
      `Invalid YAML in config file: ${(err as Error).message}`,
    );
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Config validation failed:\n${issues}`);
  }

  return result.data;
}

export interface EnvConfig {
  apiKey: string;
  apiUrl: string;
}

export function validateEnv(): EnvConfig {
  const apiKey = process.env.SCRNPIX_API_KEY;
  if (!apiKey) {
    throw new EnvError(
      "SCRNPIX_API_KEY environment variable is required. Get an API key at https://scrnpix.com?ref=website-change-monitor",
    );
  }

  const apiUrl = (
    process.env.SCRNPIX_API_URL || "https://api.scrnpix.com"
  ).replace(/\/+$/, "");

  return { apiKey, apiUrl };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}
