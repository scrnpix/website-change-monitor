import type { Config } from "../config.js";
import { SlackAlert } from "./slack.js";
import { DiscordAlert } from "./discord.js";

export interface AlertPayload {
  siteName: string;
  siteUrl: string;
  changePercentage: number;
  threshold: number;
  timestamp: string;
}

export interface AlertChannel {
  send(payload: AlertPayload): Promise<void>;
}

export async function dispatchAlerts(
  config: Config,
  payload: AlertPayload,
): Promise<void> {
  const channels: AlertChannel[] = [];

  if (config.alerts.slack) {
    channels.push(new SlackAlert(config.alerts.slack.webhookUrl));
  }
  if (config.alerts.discord) {
    channels.push(new DiscordAlert(config.alerts.discord.webhookUrl));
  }

  const results = await Promise.allSettled(
    channels.map((ch) => ch.send(payload)),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[ERROR] Alert dispatch failed: ${result.reason}`);
    }
  }
}
