import { normalizeAiResumePayload, parseResumeWithOpenAI } from '../aiResumeParser';

describe('normalizeAiResumePayload', () => {
  it('normalizes profile fields and de-duplicates skills', () => {
    const result = normalizeAiResumePayload({
      profile: {
        name: 'Alex Doe',
        currentRole: 'Product Manager',
        location: 'New York, NY',
      },
      skills: ['SQL', 'sql', '  Leadership  ', ''],
      warnings: ['Check formatting', ''],
    });

    expect(result.profile.name).toBe('Alex Doe');
    expect(result.profile.currentRole).toBe('Product Manager');
    expect(result.profile.location).toBe('New York, NY');
    expect(result.skills.length).toBe(2);
    expect(result.warnings).toEqual(['Check formatting']);
  });
});

describe('parseResumeWithOpenAI with file uploads', () => {
  const createOpenAiResponse = (payload: object) => ({
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: JSON.stringify(payload),
          },
        ],
      },
    ],
  });

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sends PDF file to responses API and parses JSON', async () => {
    const payload = {
      profile: {
        name: 'Lisa Jenkins',
        currentRole: 'Solution Architect',
        yearsExperience: '20',
        education: 'MBA',
        certifications: '',
        industries: 'Finance',
        location: 'Columbus, OH',
      },
      skills: ['Cloud Architecture', 'Risk Management'],
      warnings: [],
    };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createOpenAiResponse(payload)),
    });

    const result = await parseResumeWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
      resumeText: '',
      file: {
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        data: 'dGVzdA==',
      },
    });

    expect(result.profile.name).toBe('Lisa Jenkins');
    expect(result.skills.length).toBe(2);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/responses');
    const body = JSON.parse(options.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.filename).toBe('resume.pdf');
    expect(fileInput.file_data).toBe('dGVzdA==');
  });

  it('sends DOCX file to responses API and parses JSON', async () => {
    const payload = {
      profile: {
        name: 'Alex Doe',
        currentRole: 'Program Manager',
        yearsExperience: '8',
        education: 'B.S.',
        certifications: 'PMP',
        industries: 'Technology',
        location: 'Austin, TX',
      },
      skills: ['Program Management', 'Stakeholder Management'],
      warnings: [],
    };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createOpenAiResponse(payload)),
    });

    const result = await parseResumeWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
      resumeText: '',
      file: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: 'ZG9jeA==',
      },
    });

    expect(result.profile.currentRole).toBe('Program Manager');
    expect(result.skills.length).toBe(2);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/responses');
    const body = JSON.parse(options.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.filename).toBe('resume.docx');
    expect(fileInput.file_data).toBe('ZG9jeA==');
  });

  it('preserves file base64 payload for PDF uploads', async () => {
    const payload = {
      profile: {
        name: 'Casey Lee',
        currentRole: 'Architect',
        yearsExperience: '12',
        education: '',
        certifications: '',
        industries: '',
        location: '',
      },
      skills: [],
      warnings: [],
    };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createOpenAiResponse(payload)),
    });

    const base64 = 'AAECAwQFBgcICQorLw==';
    await parseResumeWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
      resumeText: '',
      file: {
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        data: base64,
      },
    });

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.file_data).toBe(base64);
  });
});
