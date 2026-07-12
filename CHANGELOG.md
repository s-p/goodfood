# Changelog

All notable changes to GoodFood. Newest first.

## Unreleased — Native iOS app ([#5](https://github.com/s-p/goodfood/pull/5))

### Added
- **Native iOS app** (Capacitor shell around the unchanged web app, `ios/`
  Xcode project, Swift Package Manager — no CocoaPods).
- **Smart check-in notifications:** every logged meal pre-schedules a local
  notification with iOS that arrives even when the app is closed. Press and
  hold shows five energy actions (🪫 Drained … ⚡ Energized) that save the
  check-in without opening the app; a plain tap opens the full check-in.
  The schedule self-reconciles on data/setting changes.
- **`goodfood://snap` deep link** for the Action Button via Shortcuts —
  jumps straight into the camera.
- Native-specific in-app iPhone guide; iOS app icon and launch screen
  generated from the existing SVG (`npm run icons`); README build docs.

### Changed
- Web behavior unchanged; native paths are gated on
  `Capacitor.isNativePlatform()` and the service worker is skipped in the
  native shell.

## 2026-07-10 — Cloud backup ([#4](https://github.com/s-p/goodfood/pull/4))

### Added
- Cloud backup to a **private GitHub repo** in the user's own account,
  with optional AES-GCM passphrase encryption, automatic debounced backup
  after every change, and merge-style restore.
- Shortcuts troubleshooting steps in the iPhone guide (web-app "Open App"
  quirks, Dock fallback).

## 2026-07-10 — Appearance setting ([#3](https://github.com/s-p/goodfood/pull/3))

### Added
- Appearance setting: System / Light / Dark, with pre-paint theme resolution
  to avoid a flash.

## 2026-07-10 — Pages deploy ([#2](https://github.com/s-p/goodfood/pull/2))

### Added
- GitHub Pages deployment auto-enabled from the deploy workflow.

## 2026-07-10 — Initial release ([#1](https://github.com/s-p/goodfood/pull/1))

### Added
- GoodFood: food & wellbeing tracking PWA. Snap or describe what you eat,
  Claude vision analysis (macros, micros, sensitivity flags incl. histamine),
  check-in nudges (energy 1–5 + symptoms), Insights with high-energy/avoid
  lists per meal type, offline service worker, JSON export/import.
