import type { AlertChannel, AlertPayload } from "./index.js";

export class SlackAlert implements AlertChannel {
  constructor(private webhookUrl: string) {}

  async send(payload: AlertPayload): Promise<void> {
    const body = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Visual Change Detected: ${payload.siteName}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Site:*\n<${payload.siteUrl}|${payload.siteName}>`,
            },
            {
              type: "mrkdwn",
              text: `*Change:*\n${payload.changePercentage}%`,
            },
            {
              type: "mrkdwn",
              text: `*Threshold:*\n${payload.threshold}%`,
            },
            {
              type: "mrkdwn",
              text: `*Detected at:*\n${payload.timestamp}`,
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Powered by <https://scrnpix.com?ref=website-change-monitor|Scrnpix>",
            },
          ],
        },
      ],
    };

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Slack webhook failed with status ${response.status}`,
      );
    }
  }
}
