import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { SlackAlert } from "../../src/alerts/slack.js";
import type { AlertPayload } from "../../src/alerts/index.js";

const WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";

const payload: AlertPayload = {
  siteName: "Example Site",
  siteUrl: "https://example.com",
  changePercentage: 5.23,
  threshold: 0.5,
  timestamp: "2025-01-01T00:00:00Z",
};

describe("SlackAlert", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("sends Block Kit payload to webhook URL", async () => {
    let capturedBody: Record<string, unknown> | undefined;

    nock("https://hooks.slack.com")
      .post("/services/T/B/X", (body: Record<string, unknown>) => {
        capturedBody = body;
        return true;
      })
      .reply(200, "ok");

    const alert = new SlackAlert(WEBHOOK_URL);
    await alert.send(payload);

    expect(capturedBody).toBeDefined();
    const blocks = (capturedBody as { blocks: Array<Record<string, unknown>> }).blocks;
    expect(blocks).toHaveLength(3);

    // Header block
    expect(blocks[0].type).toBe("header");

    // Section block with fields
    expect(blocks[1].type).toBe("section");
    const fields = (blocks[1] as { fields: Array<Record<string, unknown>> }).fields;
    expect(fields).toHaveLength(4);

    // Context block with Scrnpix attribution
    expect(blocks[2].type).toBe("context");
    const elements = (blocks[2] as { elements: Array<{ text: string }> }).elements;
    expect(elements[0].text).toContain("Scrnpix");
  });

  it("throws on non-200 response", async () => {
    nock("https://hooks.slack.com")
      .post("/services/T/B/X")
      .reply(500, "Internal Server Error");

    const alert = new SlackAlert(WEBHOOK_URL);
    await expect(alert.send(payload)).rejects.toThrow(
      "Slack webhook failed with status 500",
    );
  });
});
