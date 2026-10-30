# OpenCode Go Quota (Desktop)

Show your **OpenCode Go** subscription quota right in the OpenCode Desktop session header. Hover or click **Quota** next to the context / cost indicator to see the rolling (5h), weekly, and monthly windows with reset countdowns and progress bars.

```
Quota  ▸
┌──────────────────────────────────────────────────┐
│ Quota                              Personal      │
│ ──────────────────────────────────────────────── │
│ Rolling usage   [ 4% used ]        Resets in 3h 2m│
│ ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ──────────────────────────────────────────────── │
│ Weekly usage    [11% used ]        Resets in 2d 12h│
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ──────────────────────────────────────────────── │
│ Monthly usage   [29% used ]        Resets in 17d 3h│
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ──────────────────────────────────────────────── │
│ Open Console usage                                │
└──────────────────────────────────────────────────┘
```

## Why

OpenCode Desktop already knows your Go allowance, but only shows it in **Ctrl+K → View usage**. This plugin keeps the same numbers one hover away, in the header of every session. It uses the desktop GUI plugin API (`@opencode/plugin/gui`), so it runs inside the app instead of opening a browser dashboard.

## Features

- **Header pill** named `Quota`, placed next to the context / cost indicator (`session.header`, order 11).
- **Hover or click** to open a popover with:
  - Rolling (5-hour), weekly, and monthly usage
  - `% used` badge per window
  - `Resets in …` countdown
  - Progress bar per window
  - Link to the OpenCode Console activity page
- **Click to pin**, click again or click outside to close.
- Fetches **when you open the popover**, every 60 seconds while mounted, and from the **↻ Refresh** button in the popover header. The header shows the last update time (`Updated 18:42`).
- Fails soft: signed out or API errors show `Quota unavailable` and never break the composer.

Only **% used** is shown, matching the built-in Usage dialog. OpenCode Go is a subscription, so per-session dollar cost stays `$0.00` by design.

## Install

Requires **OpenCode Desktop 2.2+** with the experimental GUI plugin API, and an OpenCode Console account subscribed to Go.

```bash
opencode plugin add github:cgb12121/opencode-go-quota
```

Or configure it globally (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:cgb12121/opencode-go-quota"]
}
```

Desktop reads GUI plugins from the **global** config. Reload the app or use **Settings → Extensions → Plugins → Reload** afterwards.

### From a local checkout

```bash
git clone https://github.com/cgb12121/opencode-go-quota ~/.config/opencode/local/opencode-go-quota
cd ~/.config/opencode/local/opencode-go-quota
npm install
npm run build
```

```jsonc
{
  "plugins": ["./local/opencode-go-quota"]
}
```

## How it works

The GUI part calls the OpenCode server's `GET /api/experimental/usage/limits` endpoint with the session directory, so it reads the same allowance data as the built-in Usage dialog:

```json
{
  "go": {
    "rolling": { "percent": 4, "limited": false, "resetsAt": 1793369644000 },
    "weekly": { "percent": 11, "limited": false, "resetsAt": 1793577600000 },
    "monthly": { "percent": 29, "limited": false, "resetsAt": 1794838757000 }
  }
}
```

No API keys are read, stored, or sent anywhere by the plugin.

## Development

```bash
npm install
npm run build   # dist/gui-experimental.cjs
```

The build uses the official preset from `@opencode/plugin/gui/vite`, which compiles Solid JSX into one CommonJS bundle and keeps the app-provided modules external. Point a `plugins` entry at the checkout to test it live; a rebuild reloads the GUI in every window.

Source layout:

```
src/gui.tsx          Solid component + plugin definition
vite.config.ts       gui() preset, writes dist/gui-experimental.cjs
dist/                committed bundle used by installs
```

## Limitations

- The GUI plugin API is **experimental** in OpenCode Desktop and may change between releases.
- The usage endpoint is under `/api/experimental`.
- Desktop only. For TUI surfaces use [@slkiser/opencode-quota](https://github.com/slkiser/opencode-quota).
- The popover uses fixed dark colors on purpose; it stays readable in both themes.

## License

MIT. Not affiliated with OpenCode or its providers.
