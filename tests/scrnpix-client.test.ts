import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { ScrnpixClient, ScrnpixError } from "../src/scrnpix-client.js";

const API_URL = "https://api.scrnpix.com";
const API_KEY = "test-api-key";
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 10, // fast for tests
  maxDelayMs: 50,
};

describe("ScrnpixClient", () => {
  let client: ScrnpixClient;

  beforeEach(() => {
    client = new ScrnpixClient(API_URL, API_KEY, RETRY_CONFIG);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("captures a screenshot with default params", async () => {
    const pngBuffer = Buffer.from("fake-png-data");

    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .matchHeader("X-KEY", API_KEY)
      .reply(200, pngBuffer, { "content-type": "image/png" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
    });

    expect(result.imageBuffer).toEqual(pngBuffer);
    expect(result.contentType).toBe("image/png");
  });

  it("sends non-default params as query string", async () => {
    const jpegBuffer = Buffer.from("fake-jpeg-data");

    nock(API_URL)
      .get("/screenshot")
      .query({
        url: "https://example.com",
        width: "1920",
        height: "1080",
        full_page: "true",
        format: "jpeg",
      })
      .matchHeader("X-KEY", API_KEY)
      .reply(200, jpegBuffer, { "content-type": "image/jpeg" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
      width: 1920,
      height: 1080,
      fullPage: true,
      format: "jpeg",
    });

    expect(result.imageBuffer).toEqual(jpegBuffer);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("does not send default width/height params", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(200, Buffer.from("png"), { "content-type": "image/png" });

    await client.captureScreenshot({
      url: "https://example.com",
      width: 1280,
      height: 720,
    });

    expect(nock.isDone()).toBe(true);
  });

  it("throws ScrnpixError for 400 without retry", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://internal.local" })
      .reply(400, { error: "url_not_public", message: "URL is not publicly accessible" });

    const err = await client
      .captureScreenshot({ url: "https://internal.local" })
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(ScrnpixError);
    expect(err.message).toBe("URL is not publicly accessible");
    expect((err as ScrnpixError).statusCode).toBe(400);
    expect((err as ScrnpixError).errorCode).toBe("url_not_public");
  });

  it("throws ScrnpixError for 401 without retry", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .times(2) // for the two expect calls
      .reply(401, { error: "invalid_api_key", message: "Unauthorized" });

    await expect(
      client.captureScreenshot({ url: "https://example.com" }),
    ).rejects.toThrow(ScrnpixError);

    const err = await client
      .captureScreenshot({ url: "https://example.com" })
      .catch((e: ScrnpixError) => e);
    expect(err).toBeInstanceOf(ScrnpixError);
    expect((err as ScrnpixError).statusCode).toBe(401);
  });

  it("throws ScrnpixError for 402 without retry", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(402, { error: "insufficient_credits", message: "Insufficient credits" });

    await expect(
      client.captureScreenshot({ url: "https://example.com" }),
    ).rejects.toThrow(ScrnpixError);
  });

  it("retries on 429 and succeeds", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(429, { error: "rate_limit_exceeded" });

    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(200, Buffer.from("png-data"), { "content-type": "image/png" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
    });

    expect(result.imageBuffer).toEqual(Buffer.from("png-data"));
  });

  it("retries on 500 and succeeds", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(500, { error: "rendering_error" });

    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(200, Buffer.from("ok"), { "content-type": "image/png" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
    });

    expect(result.imageBuffer).toEqual(Buffer.from("ok"));
  });

  it("fails after exhausting retries on 500", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .times(3)
      .reply(500, { error: "rendering_error" });

    await expect(
      client.captureScreenshot({ url: "https://example.com" }),
    ).rejects.toThrow("HTTP 500");
  });

  it("respects Retry-After header on 429", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(429, { error: "rate_limit_exceeded" }, { "retry-after": "1" });

    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(200, Buffer.from("ok"), { "content-type": "image/png" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
    });

    expect(result.imageBuffer).toEqual(Buffer.from("ok"));
  });

  it("retries on network errors", async () => {
    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .replyWithError("ECONNRESET");

    nock(API_URL)
      .get("/screenshot")
      .query({ url: "https://example.com" })
      .reply(200, Buffer.from("ok"), { "content-type": "image/png" });

    const result = await client.captureScreenshot({
      url: "https://example.com",
    });

    expect(result.imageBuffer).toEqual(Buffer.from("ok"));
  });
});
