import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { DiscordAlert } from "../../src/alerts/discord.js";
import type { AlertPayload } from "../../src/alerts/index.js";

const WEBHOOK_URL = "https://discord.com/api/webhooks/123/abc";

const payload: AlertPayload = {
  siteName: "Example Site",
  siteUrl: "https://example.com",
  changePercentage: 5.23,
  threshold: 0.5,
  timestamp: "2025-01-01T00:00:00Z",
};

describe("DiscordAlert", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("sends embed payload to webhook URL", async () => {
    let capturedBody: Record<string, unknown> | undefined;

    nock("https://discord.com")
      .post("/api/webhooks/123/abc", (body: Record<string, unknown>) => {
        capturedBody = body;
        return true;
      })
      .reply(204);

    const alert = new DiscordAlert(WEBHOOK_URL);
    await alert.send(payload);

    expect(capturedBody).toBeDefined();
    const embeds = (capturedBody as { embeds: Array<Record<string, unknown>> }).embeds;
    expect(embeds).toHaveLength(1);

    const embed = embeds[0];
    expect(embed.title).toContain("Example Site");
    expect(embed.color).toBe(0xff4444);

    const fields = embed.fields as Array<{ name: string; value: string }>;
    expect(fields).toHaveLength(4);
    expect(fields[0].name).toBe("Site");
    expect(fields[1].name).toBe("Change");
    expect(fields[1].value).toBe("5.23%");

    const footer = embed.footer as { text: string };
    expect(footer.text).toContain("Scrnpix");
  });

  it("throws on non-2xx response", async () => {
    nock("https://discord.com")
      .post("/api/webhooks/123/abc")
      .reply(400, "Bad Request");

    const alert = new DiscordAlert(WEBHOOK_URL);
    await expect(alert.send(payload)).rejects.toThrow(
      "Discord webhook failed with status 400",
    );
  });
});
