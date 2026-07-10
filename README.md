# GoodFood 🍽️⚡

A private, installable PWA that answers one question: **which foods give you
energy, and which drain you?**

Snap a photo of anything you eat or drink (or type it). Claude's vision model
breaks it into components — macros, notable micros, and sensitivity flags:
**histamine, gluten, lactose, fructose, high fat, high sugar, spicy**. ~30
minutes later you get nudged for a five-second check-in (energy 1–5 +
symptoms). Over time the Insights tab builds your personal **high-energy
list** and **avoid list**, split by breakfast / lunch / dinner / snacks, with
a spotlight on histamine and fat load (built for a user without a gallbladder
who suspects histamine intolerance).

Everything stays on-device (IndexedDB + localStorage). The only network call
is the photo analysis, sent directly from your browser to the Anthropic API
with your own key.

## Run it

```bash
npm install
npm run dev       # local dev
npm run build     # production build → dist/
```

Deploy `dist/` to any static host. A GitHub Pages workflow is included —
enable **Settings → Pages → Source: GitHub Actions** and push to `main`.

## Setup

1. Open the app → **Settings** → paste your Anthropic API key
   (console.anthropic.com). Default model is Claude Opus 4.8; Sonnet 5 and
   Haiku 4.5 are available for faster/cheaper analysis.
2. On iPhone: Safari → Share → **Add to Home Screen**, then follow the
   in-app **iPhone setup guide** to bind the **Action Button** to one-press
   food logging (Shortcuts → Open App → GoodFood, with "Open camera on
   launch" enabled in Settings).

## What works where (honest notes)

| Capability | iOS (installed PWA) | Android/desktop |
|---|---|---|
| Camera capture, analysis, insights | ✅ | ✅ |
| Check-in notification while app is open | ✅ | ✅ |
| App badge for due check-ins | ✅ (16.4+) | ✅ |
| Notification while app is closed | ❌ Apple requires server push; this app is serverless by design. Use the optional Shortcuts reminder from the in-app guide. | ✅ while browser runs |
| 1-tap energy buttons on the notification | ❌ (tap opens check-in screen) | ✅ saved by the service worker, app never opens |

## Stack

Vite + React + TypeScript. No backend, no accounts, no tracking. Hand-rolled
service worker for offline use and notification actions. Export/import your
data as JSON from Settings.
