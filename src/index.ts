import { parseArgs } from "node:util";
import { loadConfig, validateEnv, ConfigError, EnvError } from "./config.js";
import type { Config, SiteConfig, EnvConfig } from "./config.js";
import { ScrnpixClient, ScrnpixError } from "./scrnpix-client.js";
import { SnapshotStorage } from "./storage.js";
import { compareImages } from "./diff.js";
import { dispatchAlerts } from "./alerts/index.js";

function printUsage(): void {
  console.log(`Usage: website-change-monitor [options]

Options:
  --config <path>  Path to config file (default: monitor.config.yml)
  --help           Show this help message

Environment variables:
  SCRNPIX_API_KEY   (required) Your Scrnpix API key
  SCRNPIX_API_URL   (optional) Override API base URL

Documentation: https://github.com/scrnpix/website-change-monitor`);
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  let parsedValues: { config: string; help: boolean };
  try {
    const args = parseArgs({
      args: argv,
      options: {
        config: { type: "string", default: "monitor.config.yml" },
        help: { type: "boolean", default: false },
      },
      strict: true,
    });
    parsedValues = {
      config: args.values.config as string,
      help: args.values.help as boolean,
    };
  } catch (err) {
    console.error(`[ERROR] ${(err as Error).message}`);
    printUsage();
    return 1;
  }

  if (parsedValues.help) {
    printUsage();
    return 0;
  }

  // Load config — fail fast on errors
  let config: Config;
  try {
    config = loadConfig(parsedValues.config);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[ERROR] ${err.message}`);
      return 1;
    }
    throw err;
  }

  // Validate environment — fail fast on errors
  let env: EnvConfig;
  try {
    env = validateEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(`[ERROR] ${err.message}`);
      return 1;
    }
    throw err;
  }

  const client = new ScrnpixClient(env.apiUrl, env.apiKey, config.retry);
  const storage = new SnapshotStorage(config.storage.path);

  console.log(`[INFO] Monitoring ${config.sites.length} site(s)...`);

  let hasFailure = false;

  for (const site of config.sites) {
    try {
      await processSite(site, config, client, storage);
    } catch (err) {
      hasFailure = true;

      // Fail fast on auth/credit errors
      if (err instanceof ScrnpixError) {
        if (err.statusCode === 401 || err.statusCode === 402) {
          console.error(`[ERROR] ${err.message} — aborting all sites`);
          return 1;
        }
      }

      const siteName = site.name || site.url;
      console.error(
        `[ERROR] Failed to process "${siteName}": ${(err as Error).message}`,
      );
    }
  }

  console.log("[INFO] Monitoring complete.");
  return hasFailure ? 1 : 0;
}

async function processSite(
  site: SiteConfig,
  config: Config,
  client: ScrnpixClient,
  storage: SnapshotStorage,
): Promise<void> {
  const siteName = site.name || new URL(site.url).hostname;
  const siteId = storage.getSiteId(site.url, site.name);

  console.log(`[INFO] Processing "${siteName}" (${site.url})...`);

  // 1. Capture screenshot
  const { imageBuffer, contentType } = await client.captureScreenshot({
    url: site.url,
    width: site.viewport.width,
    height: site.viewport.height,
    fullPage: site.fullPage,
    format: site.format,
  });

  // 2. Save latest
  storage.saveLatest(siteId, imageBuffer, site.format);

  // 3. Check for baseline
  const baseline = storage.getBaseline(siteId, site.format);
  if (!baseline) {
    console.log(
      `[INFO] No baseline for "${siteName}" — establishing baseline.`,
    );
    storage.promoteToBaseline(siteId, site.format);
    return;
  }

  // 4. Compare
  const diffResult = compareImages(
    baseline,
    imageBuffer,
    contentType,
    config.diff.threshold,
  );

  console.log(
    `[INFO] "${siteName}": ${diffResult.changePercentage}% changed (threshold: ${config.diff.changeThreshold}%)`,
  );

  // 5. Save diff image
  storage.saveDiff(siteId, diffResult.diffImageBuffer);

  // 6. Alert or promote
  if (diffResult.changePercentage >= config.diff.changeThreshold) {
    console.log(`[ALERT] "${siteName}" exceeds change threshold!`);
    await dispatchAlerts(config, {
      siteName,
      siteUrl: site.url,
      changePercentage: diffResult.changePercentage,
      threshold: config.diff.changeThreshold,
      timestamp: new Date().toISOString(),
    });
  } else {
    console.log(`[INFO] "${siteName}" below threshold — promoting to baseline.`);
    storage.promoteToBaseline(siteId, site.format);
  }
}

// CLI entry point
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("src/index.ts");

if (isMainModule) {
  run().then((code) => {
    process.exit(code);
  });
}
