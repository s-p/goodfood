# GoodFood 🍽️⚡

A private food & wellbeing tracker — installable PWA **and native iOS app** —
that answers one question: **which foods give you energy, and which drain
you?**

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

## Native iOS app

The same web app ships as a real iOS app via Capacitor (`ios/`). The native
build removes the PWA's biggest iOS limitation: check-in reminders are
scheduled with iOS and **arrive even when the app is closed** — press and
hold a notification to rate your energy (🪫 1 … ⚡ 5) without opening the
app. A plain tap opens the full check-in. The Action Button pairs via
Shortcuts: **Open URLs → `goodfood://snap`** jumps straight into the camera.

Building requires a Mac with Xcode 15+ (no CocoaPods needed — the project
uses Swift Package Manager):

```bash
npm install
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

In Xcode: select the **App** target → **Signing & Capabilities** → choose
your team (change the bundle id `app.goodfood.tracker` if Apple reports it
taken) → plug in your iPhone → **Run**. With a free Apple ID the install is
re-signed every 7 days by re-running from Xcode; a paid developer account
keeps it for a year or distributes via TestFlight.

After changing web code, re-run `npm run build && npx cap sync ios` and hit
Run again.

## Setup

1. Open the app → **Settings** → paste your Anthropic API key
   (console.anthropic.com). Default model is Claude Opus 4.8; Sonnet 5 and
   Haiku 4.5 are available for faster/cheaper analysis.
2. On iPhone: Safari → Share → **Add to Home Screen**, then follow the
   in-app **iPhone setup guide** to bind the **Action Button** to one-press
   food logging (Shortcuts → Open App → GoodFood, with "Open camera on
   launch" enabled in Settings).

## What works where (honest notes)

| Capability | iOS native app | iOS (installed PWA) | Android/desktop |
|---|---|---|---|
| Camera capture, analysis, insights | ✅ | ✅ | ✅ |
| Check-in notification while app is open | ✅ | ✅ | ✅ |
| App badge for due check-ins | ➖ (notifications cover it) | ✅ (16.4+) | ✅ |
| Notification while app is closed | ✅ pre-scheduled with iOS | ❌ Apple requires server push; this app is serverless by design. Use the optional Shortcuts reminder from the in-app guide. | ✅ while browser runs |
| Rate energy from the notification | ✅ press & hold → 5 rating buttons, saved without opening the app | ❌ (tap opens check-in screen) | ✅ saved by the service worker, app never opens |

## Stack

Vite + React + TypeScript, wrapped for iOS with Capacitor (local
notifications + deep links only — no other native code). No backend, no
accounts, no tracking. Hand-rolled service worker for offline use and
notification actions on the web. Export/import your data as JSON from
Settings.
