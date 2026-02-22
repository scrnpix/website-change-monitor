import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export class SnapshotStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  /** Derive a filesystem-safe site ID from name or URL */
  getSiteId(url: string, name?: string): string {
    if (name) {
      return slugify(name);
    }
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const raw = parsed.hostname + (pathname || "");
    return slugify(raw);
  }

  /** Get the directory path for a site's snapshots */
  getSiteDir(siteId: string): string {
    return join(this.basePath, siteId);
  }

  /** Ensure site directory exists */
  ensureSiteDir(siteId: string): void {
    mkdirSync(this.getSiteDir(siteId), { recursive: true });
  }

  /** Save the latest screenshot */
  saveLatest(siteId: string, imageBuffer: Buffer, format: string): string {
    this.ensureSiteDir(siteId);
    const ext = format === "jpeg" ? "jpeg" : "png";
    const filepath = join(this.getSiteDir(siteId), `latest.${ext}`);
    writeFileSync(filepath, imageBuffer);
    return filepath;
  }

  /** Get the baseline image buffer, or null if no baseline exists */
  getBaseline(siteId: string, format: string): Buffer | null {
    const ext = format === "jpeg" ? "jpeg" : "png";
    const filepath = join(this.getSiteDir(siteId), `baseline.${ext}`);
    if (!existsSync(filepath)) {
      return null;
    }
    return readFileSync(filepath);
  }

  /** Promote the latest screenshot to become the new baseline */
  promoteToBaseline(siteId: string, format: string): void {
    const ext = format === "jpeg" ? "jpeg" : "png";
    const latestPath = join(this.getSiteDir(siteId), `latest.${ext}`);
    const baselinePath = join(this.getSiteDir(siteId), `baseline.${ext}`);
    const latestBuffer = readFileSync(latestPath);
    writeFileSync(baselinePath, latestBuffer);
  }

  /** Save the diff image */
  saveDiff(siteId: string, diffBuffer: Buffer): string {
    this.ensureSiteDir(siteId);
    const filepath = join(this.getSiteDir(siteId), "diff.png");
    writeFileSync(filepath, diffBuffer);
    return filepath;
  }

  /** Check if a baseline exists for a site */
  hasBaseline(siteId: string, format: string): boolean {
    const ext = format === "jpeg" ? "jpeg" : "png";
    const filepath = join(this.getSiteDir(siteId), `baseline.${ext}`);
    return existsSync(filepath);
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
