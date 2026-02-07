import { Buffer } from 'buffer';
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

const uploadFileToOpenAI = async ({
  apiKey,
  baseUrl,
  file,
}: {
  apiKey: string;
  baseUrl: string;
  file: { name: string; mimeType: string; data: string };
}) => {
  const upload = async (purpose: string) => {
    const binary = Buffer.from(file.data, 'base64');
    const blob = new Blob([binary], {
      type: file.mimeType || 'application/octet-stream',
    });
    const formData = new FormData();
    formData.append('purpose', purpose);
    formData.append('file', blob, file.name || 'resume');

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const rawText = await response.text();
    if (!response.ok) {
      return { id: '', error: rawText, status: response.status };
    }

    const data = parseJsonSafely(rawText);
    return { id: data?.id || '', error: '', status: response.status };
  };

  const primary = await upload('assistants');
  if (primary.id) return primary.id;

  const fallback = await upload('user_data');
  if (fallback.id) return fallback.id;

  throw new Error(`File upload failed: ${primary.error || fallback.error}`);
};

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
    const fileId = await uploadFileToOpenAI({
      apiKey,
      baseUrl,
      file,
    });

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/responses`, {
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
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_file',
                file_id: fileId,
              },
            ],
          },
        ],
        text: {
          format: {
            name: 'resume_parse',
            type: 'json_schema',
            json_schema: buildJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI parser failed (${response.status}): ${errorText}`);
    }

    const rawText = await response.text();
    const data = parseJsonSafely(rawText);
    const outputText =
      data?.output?.[0]?.content?.find((item: { type?: string }) => item.type === 'output_text')
        ?.text ||
      data?.output_text ||
      data?.output?.[0]?.content?.[0]?.text ||
      '';

    const parsed = extractJsonFromText(outputText);
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
