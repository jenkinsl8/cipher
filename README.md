# Cipher Career Strategist

This repository contains a cross-platform (web + mobile) Expo app that powers
Cipher, an AI career strategist and job market analyst. The app collects user
inputs, ranks transferable skills by market value, and generates AI impact,
career path, and market-aware guidance.

## Project layout

- `cipher-app/` - Expo React Native app (runs on iOS, Android, and Web)

## Run locally

```bash
cd cipher-app
npm install
npm run web     # web app
npm run android # Android emulator or device
npm run ios     # iOS simulator (macOS required)
```

## What the app does

- Collects work history, skills, demographics, and goals
- Builds a skills portfolio with AI impact analysis per skill
- Produces AI-forward opportunities and learning roadmaps
- Supports LinkedIn Connections CSV upload for network analysis
- Offers resume upload with ATS readiness scan and recommendations
- Outputs multi-tier career paths with 3-year and 5-year plans