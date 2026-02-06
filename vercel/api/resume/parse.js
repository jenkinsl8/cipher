const JSZip = require('jszip');
let pdfParse = null;
try {
  // Optional dependency for more reliable PDF text extraction on Vercel.
  // eslint-disable-next-line global-require
  pdfParse = require('pdf-parse');
} catch (error) {
  pdfParse = null;
}

const buildPrompt = (resumeText) => `Parse the resume text and return JSON with:
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

const parseJsonSafely = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonFromText = (value) => {
  const trimmed = (value || '').trim();
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

const decodeXmlEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripNonPrintable = (value) =>
  value.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();

const decodePdfString = (value) => {
  const withEscapes = value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

  return withEscapes.replace(/\\([0-7]{1,3})/g, (match, octal) =>
    String.fromCharCode(parseInt(octal, 8))
  );
};

const decodeBase64 = (value) => Buffer.from(value, 'base64');

const extractTextFromPdfBinary = async (buffer) => {
  if (pdfParse) {
    try {
      const parsed = await pdfParse(buffer);
      if (parsed?.text?.trim()) {
        return parsed.text.trim();
      }
    } catch (error) {
      // Fall back to best-effort parsing below.
    }
  }
  const content = buffer.toString('latin1');
  const parts = [];
  const tjRegex = /\(([^()]*)\)\s*Tj/g;
  const tjArrayRegex = /\[(.*?)\]\s*TJ/gs;

  for (const match of content.matchAll(tjRegex)) {
    const raw = match[1];
    if (raw) parts.push(decodePdfString(raw));
  }

  for (const match of content.matchAll(tjArrayRegex)) {
    const arrayContent = match[1];
    if (!arrayContent) continue;
    const strings = arrayContent.match(/\(([^()]*)\)/g) || [];
    strings.forEach((entry) => {
      const raw = entry.slice(1, -1);
      if (raw) parts.push(decodePdfString(raw));
    });
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

const extractTextFromDocxBinary = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) return '';
  const xml = await doc.async('string');
  const paragraphs = xml.split('</w:p>');
  const extracted = [];

  paragraphs.forEach((paragraph) => {
    const matches = paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (!matches) return;
    const text = matches
      .map((match) => match.replace(/<w:t[^>]*>/, '').replace('</w:t>', ''))
      .map((segment) => decodeXmlEntities(segment))
      .join(' ');
    if (text.trim()) {
      extracted.push(text.trim());
    }
  });

  return extracted.join('\n').trim();
};

const extractTextFromDocBinary = (buffer) =>
  stripNonPrintable(buffer.toString('latin1'));

const extractTextFromFile = async (file) => {
  if (!file?.data) return { text: '', warnings: [] };
  const name = (file.name || '').toLowerCase();
  const extension = name.split('.').pop() || '';
  const mimeType = (file.mimeType || '').toLowerCase();
  const buffer = decodeBase64(file.data);
  const warnings = [];

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    const text = await extractTextFromPdfBinary(buffer);
    if (!text) warnings.push('PDF text extraction returned empty output.');
    return { text, warnings };
  }

  if (
    extension === 'docx' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const text = await extractTextFromDocxBinary(buffer);
    if (!text) warnings.push('DOCX text extraction returned empty output.');
    return { text, warnings };
  }

  if (extension === 'doc' || mimeType === 'application/msword') {
    const text = extractTextFromDocBinary(buffer);
    if (!text) warnings.push('DOC text extraction returned empty output.');
    return { text, warnings };
  }

  return { text: '', warnings: ['Unsupported file type for extraction.'] };
};

const jsonSchema = {
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
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const body = typeof req.body === 'string' ? parseJsonSafely(req.body) : req.body;
  const resumeText = body?.text?.trim();
  const model = body?.model || process.env.OPENAI_MODEL || 'gpt-4o';
  const file = body?.file;

  const fileExtraction = await extractTextFromFile(file);
  const warnings = [...fileExtraction.warnings];
  if (resumeText && resumeText.length < 80) {
    warnings.push('Resume text is short; extraction accuracy may be reduced.');
  }
  const finalText = resumeText || fileExtraction.text;

  if (!finalText) {
    res.status(400).json({
      profile: {},
      skills: [],
      warnings: warnings.length
        ? warnings
        : ['Resume text is empty. Provide text or a supported file.'],
    });
    return;
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(
    /\/$/,
    ''
  );
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const prompt = buildPrompt(finalText);

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
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_schema', json_schema: jsonSchema },
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      return { parsed: null, error: rawText, status: response.status };
    }
    const data = parseJsonSafely(rawText);
    const outputText =
      data?.output?.[0]?.content?.find((item) => item.type === 'output_text')?.text ||
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
          { role: 'user', content: prompt },
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
    res.status(502).json({
      profile: {},
      skills: [],
      warnings: warnings.length ? warnings : ['AI returned invalid JSON.'],
      error: fallback.error,
    });
    return;
  }

  if (warnings.length) {
    fallback.parsed.warnings = Array.from(
      new Set([...(fallback.parsed.warnings || []), ...warnings])
    );
  }

  res.status(200).json(fallback.parsed);
};
