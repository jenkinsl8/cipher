export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
}

const corsHeaders = (origin: string | null, allowed: string | undefined) => {
  const allowAll = !allowed || allowed.trim() === '*';
  const allowedList = (allowed || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = allowAll
    ? '*'
    : allowedList.includes(origin || '') ? origin || '' : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
};

const buildPrompt = (resumeText: string) => `Parse the resume text and return JSON with:
{
  "profile": {
    "name": "",
    "currentRole": "",
    "yearsExperience": "",
    "education": "",
    "certifications": "",
    "industries": "",
    "location": ""
  },
  "skills": ["", ""],
  "warnings": [""]
}

Rules:
- Keep values concise and exact.
- skills should be a list of core skills, tools, and domains (no sentences).
- yearsExperience should be a number as a string if possible.
- If data is missing, use an empty string or omit warnings.

Resume text:
${resumeText}`;

const parseJsonSafely = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/resume/parse') {
      return new Response('Not Found', { status: 404, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    const body = await request.json().catch(() => null);
    const resumeText = body?.text?.trim();
    const model = body?.model || env.OPENAI_MODEL || 'gpt-4o';

    if (!resumeText) {
      return new Response(
        JSON.stringify({ profile: {}, skills: [], warnings: ['Resume text is empty.'] }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a resume parsing assistant. Extract structured data from the resume. Return only valid JSON.',
          },
          {
            role: 'user',
            content: buildPrompt(resumeText),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({
          profile: {},
          skills: [],
          warnings: [`AI request failed (${response.status}).`],
          error: errorText,
        }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = parseJsonSafely(content);

    if (!parsed) {
      return new Response(
        JSON.stringify({
          profile: {},
          skills: [],
          warnings: ['AI returned invalid JSON.'],
        }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
