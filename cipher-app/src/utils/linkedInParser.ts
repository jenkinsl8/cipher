import { LinkedInConnection } from '../types';
import { parseLinkedInConnections } from './csv';
import { extractJsonFromText } from './aiResumeParser';

type LinkedInParsePayload = {
  connections?: LinkedInConnection[];
  warnings?: string[];
};

export const parseLinkedInFileLocally = (text: string): LinkedInConnection[] =>
  parseLinkedInConnections(text);

export const parseLinkedInWithOpenAI = async ({
  apiKey,
  model,
  baseUrl = 'https://api.openai.com',
  file,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  file: {
    name: string;
    mimeType: string;
    data: string;
  };
}): Promise<LinkedInParsePayload> => {
  if (!file?.data) {
    return { connections: [], warnings: ['LinkedIn file is empty.'] };
  }
  const fileData = file.data.startsWith('data:')
    ? file.data
    : `data:${file.mimeType || 'text/plain'};base64,${file.data}`;

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
            'You parse LinkedIn connection exports into structured JSON. Return only valid JSON.',
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
              text: `Extract LinkedIn connections into JSON:
{
  "connections": [
    {
      "firstName": "",
      "lastName": "",
      "email": "",
      "company": "",
      "position": "",
      "connectedOn": "",
      "location": ""
    }
  ],
  "warnings": [""]
}
Only include fields present in the file. If data is missing, use empty strings.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI LinkedIn parser failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const parsed = extractJsonFromText(content) as LinkedInParsePayload | null;
  if (!parsed) {
    throw new Error('AI LinkedIn parser returned invalid JSON.');
  }

  return parsed;
};
