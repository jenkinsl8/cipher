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
nvm use 20 # or any Node 18.18+ / 20+
npm install
npm run web     # web app
npm run android # Android emulator or device
npm run ios     # iOS simulator (macOS required)
```

## GitHub Pages

The Expo web build is deployed via GitHub Actions to GitHub Pages. Once the
workflow completes, the app is available at:

```
https://jenkinsl8.github.io/cipher/
```

Note: The web output is set to "single" to avoid expo-router requirements for
local development and Pages hosting.

## Serverless AI Resume Parser (no API key in app)

To use the AI resume parser without placing an API key in the client, deploy the
Cloudflare Worker in `serverless/` and paste the Worker URL into the app.

```bash
cd serverless
wrangler login
wrangler secret put OPENAI_API_KEY
wrangler deploy
```

Then set the **AI parser URL** in the app (e.g.,
`https://cipher-parser.<your-subdomain>.workers.dev`).

## What the app does

- Extracts work history, skills, and education from PDF/DOCX resumes
- Optional AI resume parser via serverless endpoint (no API key in app) for higher accuracy
- Collects demographics and goals for personalization
- Builds a skills portfolio with AI impact analysis per skill
- Produces AI-forward opportunities and learning roadmaps
- Supports LinkedIn Connections CSV upload for network analysis
- Offers resume upload with ATS readiness scan and recommendations
- Outputs multi-tier career paths with 3-year and 5-year plans