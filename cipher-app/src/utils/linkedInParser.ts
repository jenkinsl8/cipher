import { LinkedInConnection } from '../types';
import { parseLinkedInConnections } from './csv';
import { extractJsonFromText } from './aiResumeParser';

type LinkedInParsePayload = {
  connections?: LinkedInConnection[];
  warnings?: string[];
};

const inferMimeType = (file: { name?: string; mimeType?: string }) => {
  const provided = file.mimeType?.trim();
  if (provided && provided.includes('/')) return provided;
  const extension = (file.name?.toLowerCase().split('.').pop() || '').trim();

  switch (extension) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'txt':
      return 'text/plain';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
};

const decodeBase64 = (value: string) => {
  const payload = value.includes(',') ? value.split(',')[1] || '' : value;

  try {
    if (typeof atob === 'function') {
      return atob(payload);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bufferCtor = (globalThis as any)?.Buffer;
    if (bufferCtor?.from) {
      return bufferCtor.from(payload, 'base64').toString('utf8');
    }
  } catch {
    return '';
  }

  return '';
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

  const mimeType = inferMimeType(file);
  const fileData = file.data.startsWith('data:')
    ? file.data
    : `data:${mimeType};base64,${file.data}`;

  if (mimeType === 'text/csv') {
    const csvText = decodeBase64(fileData);
    if (!csvText.trim()) {
      return {
        connections: [],
        warnings: ['Unable to decode CSV file contents.'],
      };
    }

    return {
      connections: parseLinkedInConnections(csvText),
      warnings: [],
    };
  }

  const supportsFileAttachment = mimeType === 'application/pdf';

  const textPrompt = `Extract LinkedIn connections into JSON:
{
  "connections": [
    {
      "firstName": "",
      "lastName": "",
      "url": "",
      "email": "",
      "company": "",
      "position": "",
      "connectedOn": "",
      "location": ""
    }
  ],
  "warnings": [""]
}
Only include fields present in the file. If data is missing, use empty strings.`;

  const fileContentText = !supportsFileAttachment ? decodeBase64(fileData) : '';

  const userContent = supportsFileAttachment
    ? [
        {
          type: 'file',
          file: {
            filename: file.name,
            file_data: fileData,
          },
        },
        {
          type: 'text',
          text: textPrompt,
        },
      ]
    : `${textPrompt}

File name: ${file.name}
MIME type: ${mimeType}
File contents:
${fileContentText || '[Unable to decode file contents from base64. Please infer from available plain text if any.]'}`;

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
          content: userContent,
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
