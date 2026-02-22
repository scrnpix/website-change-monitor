import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SnapshotStorage } from "../src/storage.js";

const TMP_DIR = join(import.meta.dirname, ".tmp-storage-test");

describe("SnapshotStorage", () => {
  let storage: SnapshotStorage;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    storage = new SnapshotStorage(TMP_DIR);
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  describe("getSiteId", () => {
    it("slugifies name when provided", () => {
      expect(storage.getSiteId("https://example.com", "My Cool Site")).toBe(
        "my-cool-site",
      );
    });

    it("uses hostname when no name", () => {
      expect(storage.getSiteId("https://example.com")).toBe("example-com");
    });

    it("includes pathname in site ID", () => {
      expect(storage.getSiteId("https://example.com/blog/posts")).toBe(
        "example-com-blog-posts",
      );
    });

    it("strips trailing slashes from pathname", () => {
      expect(storage.getSiteId("https://example.com/blog/")).toBe(
        "example-com-blog",
      );
    });

    it("handles special characters", () => {
      expect(
        storage.getSiteId("https://example.com", "Site #1 (Test)"),
      ).toBe("site-1-test");
    });
  });

  describe("saveLatest", () => {
    it("saves a PNG file", () => {
      const buf = Buffer.from("fake-png");
      const path = storage.saveLatest("test-site", buf, "png");
      expect(path).toBe(join(TMP_DIR, "test-site", "latest.png"));
      expect(readFileSync(path)).toEqual(buf);
    });

    it("saves a JPEG file", () => {
      const buf = Buffer.from("fake-jpeg");
      const path = storage.saveLatest("test-site", buf, "jpeg");
      expect(path).toBe(join(TMP_DIR, "test-site", "latest.jpeg"));
      expect(readFileSync(path)).toEqual(buf);
    });

    it("creates the site directory if needed", () => {
      const siteDir = join(TMP_DIR, "new-site");
      expect(existsSync(siteDir)).toBe(false);
      storage.saveLatest("new-site", Buffer.from("data"), "png");
      expect(existsSync(siteDir)).toBe(true);
    });
  });

  describe("getBaseline / hasBaseline", () => {
    it("returns null when no baseline exists", () => {
      storage.ensureSiteDir("no-baseline");
      expect(storage.getBaseline("no-baseline", "png")).toBeNull();
      expect(storage.hasBaseline("no-baseline", "png")).toBe(false);
    });

    it("returns baseline buffer when it exists", () => {
      const buf = Buffer.from("baseline-data");
      const siteDir = join(TMP_DIR, "has-baseline");
      mkdirSync(siteDir, { recursive: true });
      writeFileSync(join(siteDir, "baseline.png"), buf);

      expect(storage.getBaseline("has-baseline", "png")).toEqual(buf);
      expect(storage.hasBaseline("has-baseline", "png")).toBe(true);
    });
  });

  describe("promoteToBaseline", () => {
    it("copies latest to baseline", () => {
      const buf = Buffer.from("latest-data");
      storage.saveLatest("promo-site", buf, "png");
      storage.promoteToBaseline("promo-site", "png");

      const baseline = storage.getBaseline("promo-site", "png");
      expect(baseline).toEqual(buf);
    });
  });

  describe("saveDiff", () => {
    it("saves diff image as PNG", () => {
      const buf = Buffer.from("diff-data");
      const path = storage.saveDiff("diff-site", buf);
      expect(path).toBe(join(TMP_DIR, "diff-site", "diff.png"));
      expect(readFileSync(path)).toEqual(buf);
    });
  });
});
