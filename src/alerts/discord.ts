import type { AlertChannel, AlertPayload } from "./index.js";

export class DiscordAlert implements AlertChannel {
  constructor(private webhookUrl: string) {}

  async send(payload: AlertPayload): Promise<void> {
    const body = {
      embeds: [
        {
          title: `Visual Change Detected: ${payload.siteName}`,
          color: 0xff4444,
          fields: [
            {
              name: "Site",
              value: `[${payload.siteName}](${payload.siteUrl})`,
              inline: true,
            },
            {
              name: "Change",
              value: `${payload.changePercentage}%`,
              inline: true,
            },
            {
              name: "Threshold",
              value: `${payload.threshold}%`,
              inline: true,
            },
            {
              name: "Detected at",
              value: payload.timestamp,
              inline: false,
            },
          ],
          footer: {
            text: "Powered by Scrnpix",
          },
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
        `Discord webhook failed with status ${response.status}`,
      );
    }
  }
}
