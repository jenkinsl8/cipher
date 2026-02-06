# Serverless AI Resume Parser (Cloudflare Worker)

This worker hosts the AI resume parser so the app can call it without putting
an API key on the client device.

## Prereqs

- Cloudflare account
- `wrangler` CLI: `npm install -g wrangler`

## Setup

```bash
cd serverless
wrangler login
```

## Configure secrets

```bash
wrangler secret put OPENAI_API_KEY
```

Optional:

```bash
wrangler secret put OPENAI_BASE_URL
wrangler secret put OPENAI_MODEL
```

## Deploy

```bash
wrangler deploy
```

After deploy, copy the Worker URL (e.g., `https://cipher-parser.<your-subdomain>.workers.dev`)
and paste it into the app's **AI Parser URL** field.

## Endpoint

`POST /api/resume/parse`

Payload:

```json
{
  "text": "resume text",
  "model": "gpt-4o",
  "file": {
    "name": "resume.pdf",
    "mimeType": "application/pdf",
    "data": "base64-encoded-bytes"
  }
}
```

Response:

```json
{
  "profile": { "name": "", "currentRole": "", "yearsExperience": "" },
  "skills": ["", ""],
  "warnings": [""]
}
```
