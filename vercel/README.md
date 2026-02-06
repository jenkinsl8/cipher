# Vercel AI Resume Parser (no API key in app)

This serverless endpoint runs on Vercel and keeps your OpenAI key server-side.

## Deploy

1. Create a new Vercel project and set the **Root Directory** to `vercel/`.
2. Add environment variables:
   - `OPENAI_API_KEY` (required)
   - `OPENAI_MODEL` (optional, default: `gpt-4o`)
   - `OPENAI_BASE_URL` (optional, default: `https://api.openai.com`)
3. Deploy.

Your endpoint will be:

```
https://<your-project>.vercel.app/api/resume/parse
```

## Test

```bash
curl -i https://<your-project>.vercel.app/api/resume/parse \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","text":"Test resume text"}'
```

## App configuration

In the app, set the **AI parser URL** to:

```
https://<your-project>.vercel.app
```
