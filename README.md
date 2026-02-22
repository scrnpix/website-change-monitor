# Website Change Monitor

Scheduled visual change detection for websites. Captures screenshots, compares them pixel-by-pixel against a saved baseline, and sends Slack/Discord alerts when changes exceed a configurable threshold.

Powered by [Scrnpix](https://scrnpix.com?ref=website-change-monitor) — [Get your API key](https://scrnpix.com?ref=website-change-monitor)

## Quickstart

```bash
# Clone the repo
git clone https://github.com/scrnpix/website-change-monitor.git
cd website-change-monitor

# Install dependencies
npm install

# Configure
cp monitor.config.example.yml monitor.config.yml
# Edit monitor.config.yml with your sites and alert webhooks

# Set your Scrnpix API key
export SCRNPIX_API_KEY="your_api_key_here"

# Run
npm run monitor
```

First run establishes a baseline. Subsequent runs compare against it and alert on changes.

## Configuration

Create a `monitor.config.yml` file:

```yaml
sites:
  - url: "https://example.com"
    name: "Example Homepage"          # optional, defaults to hostname
    viewport:
      width: 1280                     # optional, default 1280 (100–4000)
      height: 720                     # optional, default 720 (100–4000)
    fullPage: false                   # optional, default false
    format: "png"                     # optional, "png" or "jpeg", default "png"

diff:
  threshold: 0.1                     # pixelmatch per-pixel sensitivity (0–1), default 0.1
  changeThreshold: 0.5              # % of changed pixels to trigger alert (0–100), default 0.5

storage:
  type: "local"                      # only "local" for now
  path: "./snapshots"                # default "./snapshots"

alerts:                              # at least one required
  slack:
    webhookUrl: "https://hooks.slack.com/services/..."
  discord:
    webhookUrl: "https://discord.com/api/webhooks/..."

retry:
  maxAttempts: 3                     # default 3
  initialDelayMs: 1000              # default 1000
  maxDelayMs: 30000                 # default 30000
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SCRNPIX_API_KEY` | Yes | — | Your Scrnpix API key |
| `SCRNPIX_API_URL` | No | `https://api.scrnpix.com` | Override API base URL |

## Threshold Tuning

- **`diff.threshold`** (0–1): Per-pixel color sensitivity for pixelmatch. Lower values detect subtler color changes. `0.1` is a good default.
- **`diff.changeThreshold`** (0–100): Percentage of pixels that must differ to trigger an alert. Increase to reduce false positives from minor rendering differences.

Tips for reducing false positives:
- Start with `changeThreshold: 1.0` and lower as needed
- Use `fullPage: false` to avoid changes in below-fold content
- Use specific viewport sizes to match your target audience

## Alert Payloads

### Slack (Block Kit)

```json
{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "Visual Change Detected: Example" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Site:*\n<https://example.com|Example>" },
      { "type": "mrkdwn", "text": "*Change:*\n5.23%" },
      { "type": "mrkdwn", "text": "*Threshold:*\n0.5%" },
      { "type": "mrkdwn", "text": "*Detected at:*\n2025-01-01T00:00:00Z" }
    ]},
    { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Powered by Scrnpix" }] }
  ]
}
```

### Discord (Embed)

```json
{
  "embeds": [{
    "title": "Visual Change Detected: Example",
    "color": 16728132,
    "fields": [
      { "name": "Site", "value": "[Example](https://example.com)", "inline": true },
      { "name": "Change", "value": "5.23%", "inline": true },
      { "name": "Threshold", "value": "0.5%", "inline": true },
      { "name": "Detected at", "value": "2025-01-01T00:00:00Z" }
    ],
    "footer": { "text": "Powered by Scrnpix" }
  }]
}
```

## CI / Automation

### GitHub Actions

The included `.github/workflows/monitor.yml` runs every 6 hours:

1. Add `SCRNPIX_API_KEY` to your repository secrets
2. Create `monitor.config.yml` in the repo root
3. Snapshots are cached between runs via `actions/cache`
4. Diff images are uploaded as artifacts (30-day retention)

You can also trigger manually via the **Run workflow** button.

## How It Works

1. **Capture** — Takes a screenshot of each configured site via the Scrnpix API
2. **Store** — Saves the screenshot as `latest.{png,jpeg}` in the snapshots directory
3. **Compare** — Runs pixelmatch against the saved `baseline.{png,jpeg}`
4. **Alert** — If changed pixels exceed `changeThreshold`, sends alerts to configured channels
5. **Promote** — If below threshold, promotes latest to baseline (prevents false-positive accumulation)

On first run (no baseline exists), the screenshot is saved as both latest and baseline.

## Troubleshooting

| Error | Fix |
|---|---|
| `SCRNPIX_API_KEY environment variable is required` | Set `SCRNPIX_API_KEY` in your environment or CI secrets |
| `Config file not found` | Ensure `monitor.config.yml` exists or pass `--config path` |
| `Unauthorized` (401) | Check your API key is valid |
| `Insufficient credits` (402) | Top up credits at scrnpix.com |
| `url_not_public` (400) | The target URL must be publicly accessible |
| `rate_limit_exceeded` (429) | Reduce site count or increase retry delays |
| `Dimension mismatch` warning | Viewport size changed — delete the old baseline to reset |

## Development

```bash
# Run linter
npm run lint

# Type-check
npm run typecheck

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run the monitor
npm run monitor
npm run monitor -- --help
npm run monitor -- --config path/to/config.yml
```

## License

[MIT](LICENSE)

---

Powered by [Scrnpix](https://scrnpix.com?ref=website-change-monitor)
