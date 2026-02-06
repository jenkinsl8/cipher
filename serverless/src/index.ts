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

const extractJsonFromText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = parseJsonSafely(trimmed);
  if (direct) return direct;
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return parseJsonSafely(trimmed.slice(first, last + 1));
  }
  return null;
};

const buildJsonSchema = () => ({
  name: 'resume_parse',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      profile: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          currentRole: { type: 'string' },
          yearsExperience: { type: 'string' },
          education: { type: 'string' },
          certifications: { type: 'string' },
          industries: { type: 'string' },
          location: { type: 'string' },
        },
        required: [
          'name',
          'currentRole',
          'yearsExperience',
          'education',
          'certifications',
          'industries',
          'location',
        ],
      },
      skills: {
        type: 'array',
        items: { type: 'string' },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['profile', 'skills', 'warnings'],
  },
});

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
    const headers = {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const prompt = buildPrompt(resumeText);

    const tryResponses = async () => {
      const response = await fetch(`${baseUrl}/v1/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content:
                'You are a resume parsing assistant. Extract structured data from the resume. Return only valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: buildJsonSchema(),
          },
        }),
      });

      const rawText = await response.text();
      if (!response.ok) {
        return { parsed: null, error: rawText, status: response.status };
      }

      const data = parseJsonSafely(rawText);
      const outputText =
        data?.output?.[0]?.content?.find((item: { type?: string }) => item.type === 'output_text')
          ?.text ||
        data?.output_text ||
        data?.output?.[0]?.content?.[0]?.text ||
        '';

      return { parsed: extractJsonFromText(outputText), error: null, status: response.status };
    };

    const tryChat = async () => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
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
              content: prompt,
            },
          ],
        }),
      });

      const rawText = await response.text();
      if (!response.ok) {
        return { parsed: null, error: rawText, status: response.status };
      }

      const data = parseJsonSafely(rawText);
      const outputText = data?.choices?.[0]?.message?.content || '';
      return { parsed: extractJsonFromText(outputText), error: null, status: response.status };
    };

    const primary = await tryResponses();
    const fallbackNeeded = !primary.parsed && [400, 404].includes(primary.status || 0);
    const fallback = fallbackNeeded ? await tryChat() : primary;

    if (!fallback.parsed) {
      return new Response(
        JSON.stringify({
          profile: {},
          skills: [],
          warnings: ['AI returned invalid JSON.'],
          error: fallback.error,
        }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(fallback.parsed), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
