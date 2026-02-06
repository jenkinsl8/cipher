import { ResumeExtraction, UserProfile } from '../types';
import { buildSkillInputsFromNames } from './resume';

type AiResumePayload = {
  profile?: Partial<UserProfile>;
  skills?: string[];
  warnings?: string[];
};

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

export const parseResumeWithAI = async ({
  model,
  resumeText,
  baseUrl = 'http://localhost:11434',
}: {
  model: string;
  resumeText: string;
  baseUrl?: string;
}): Promise<ResumeExtraction> => {
  if (!resumeText.trim()) {
    return {
      profile: {},
      skills: [],
      warnings: ['Resume text is empty.'],
      sections: {},
    };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      stream: false,
      format: 'json',
      messages: [
        {
          role: 'system',
          content:
            'You are a resume parsing assistant. Extract structured data from the resume. Return only valid JSON.',
        },
        {
          role: 'user',
          content: `Parse the resume text and return JSON with:
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
${resumeText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI parser failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.message?.content || data.response || '';
  if (!content) {
    throw new Error('AI parser returned empty response.');
  }

  let payload: AiResumePayload;
  try {
    payload = JSON.parse(content);
  } catch (error) {
    throw new Error('AI parser returned invalid JSON.');
  }

  return normalizeAiResumePayload(payload);
};
