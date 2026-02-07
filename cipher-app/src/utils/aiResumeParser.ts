import { ResumeExtraction, UserProfile } from '../types';
import { buildSkillInputsFromNames } from './resume';

type AiResumePayload = {
  profile?: Partial<UserProfile>;
  skills?: string[];
  warnings?: string[];
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
      skills: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['profile', 'skills', 'warnings'],
  },
});

const sanitizeList = (items?: string[]) =>
  (items || [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const uniqueList = (items: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

export const normalizeAiResumePayload = (payload: AiResumePayload): ResumeExtraction => {
  const profile: Partial<UserProfile> = {
    name: payload.profile?.name || '',
    currentRole: payload.profile?.currentRole || '',
    yearsExperience: payload.profile?.yearsExperience || '',
    education: payload.profile?.education || '',
    certifications: payload.profile?.certifications || '',
    industries: payload.profile?.industries || '',
    location: payload.profile?.location || '',
  };

  const skills = buildSkillInputsFromNames(
    uniqueList(sanitizeList(payload.skills))
  );

  return {
    profile,
    skills,
    warnings: sanitizeList(payload.warnings),
    sections: {},
  };
};

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

const buildJsonSchemaPayload = () => ({
  name: 'resume_parse',
  schema: buildJsonSchema().schema,
  strict: true,
});

export const parseResumeWithServerless = async ({
  model,
  resumeText,
  baseUrl,
  file,
}: {
  model: string;
  resumeText: string;
  baseUrl: string;
  file?: {
    name: string;
    mimeType: string;
    data: string;
  };
}): Promise<ResumeExtraction> => {
  if (!resumeText.trim() && !file?.data) {
    return {
      profile: {},
      skills: [],
      warnings: ['Resume text is empty.'],
      sections: {},
    };
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/api/resume/parse`,
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      text: resumeText,
      file,
    }),
  }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI parser failed (${response.status}): ${errorText}`);
  }

  const rawText = await response.text();
  const parsed = normalizeAiResumePayload(
    (() => {
      try {
        return JSON.parse(rawText);
      } catch (error) {
        throw new Error(`Parser response was not valid JSON: ${rawText.slice(0, 200)}`);
      }
    })()
  );

  return parsed;
};

export const parseResumeWithOpenAI = async ({
  apiKey,
  model,
  resumeText,
  file,
  baseUrl = 'https://api.openai.com',
}: {
  apiKey: string;
  model: string;
  resumeText: string;
  file?: {
    name: string;
    mimeType: string;
    data: string;
  };
  baseUrl?: string;
}): Promise<ResumeExtraction> => {
  if (!resumeText.trim() && !file?.data) {
    return {
      profile: {},
      skills: [],
      warnings: ['Resume text is empty.'],
      sections: {},
    };
  }

  const prompt = `Parse the resume text and return JSON with:
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

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (file?.data) {
    const fileData = `data:${file.mimeType || 'application/pdf'};base64,${file.data}`;
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: buildJsonSchemaPayload(),
        },
        messages: [
          {
            role: 'system',
            content:
              'You are a resume parsing assistant. Extract structured data from the resume. Return only valid JSON.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'file',
                file: {
                  filename: file.name,
                  file_data: fileData,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI parser failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('AI parser returned empty response.');
    }

    const parsed = extractJsonFromText(content);
    if (!parsed) {
      throw new Error('AI parser returned invalid JSON.');
    }
    return normalizeAiResumePayload(parsed);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: buildJsonSchemaPayload(),
      },
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI parser failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('AI parser returned empty response.');
  }

  const parsed = extractJsonFromText(content);
  if (!parsed) {
    throw new Error('AI parser returned invalid JSON.');
  }

  return normalizeAiResumePayload(parsed);
};
