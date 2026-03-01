# Vercel AI Resume Parser (no API key in app)

This serverless endpoint runs on Vercel and keeps your OpenAI key server-side.
It uses `pdf-parse` for robust PDF extraction.

## Deploy

1. Create a new Vercel project and set the **Root Directory** to `vercel/`.
2. Add environment variables:
   - `OPENAI_API_KEY` (required)
   - `OPENAI_MODEL` (optional, default: `gpt-5.2`)
   - `OPENAI_BASE_URL` (optional, default: `https://api.openai.com`)
3. Deploy.

Your resume parse endpoint will be:

```
https://<your-project>.vercel.app/api/resume/parse
```

Agent chat endpoint:

```
https://<your-project>.vercel.app/api/agent/chat
```

## Test

```bash
curl -i https://<your-project>.vercel.app/api/resume/parse \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.2","text":"Test resume text"}'
```

## App configuration

In the app, set the **AI parser URL** to this base URL (used for resume parsing and agent chat):

```
https://<your-project>.vercel.app
```
