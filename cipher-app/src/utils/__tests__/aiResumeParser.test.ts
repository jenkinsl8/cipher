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

  it('uploads PDF to files API and parses JSON', async () => {
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
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'file-123' }),
      })
      .mockResolvedValueOnce({
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

    const [uploadUrl] = fetchMock.mock.calls[0];
    const [responseUrl, responseOptions] = fetchMock.mock.calls[1];
    expect(uploadUrl).toContain('/v1/files');
    expect(responseUrl).toContain('/v1/responses');
    const body = JSON.parse(responseOptions.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.file_id).toBe('file-123');
  });

  it('uploads DOCX to files API and parses JSON', async () => {
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
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'file-456' }),
      })
      .mockResolvedValueOnce({
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

    const [uploadUrl] = fetchMock.mock.calls[0];
    const [responseUrl, responseOptions] = fetchMock.mock.calls[1];
    expect(uploadUrl).toContain('/v1/files');
    expect(responseUrl).toContain('/v1/responses');
    const body = JSON.parse(responseOptions.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.file_id).toBe('file-456');
  });

  it('uploads file before sending to responses API', async () => {
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
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ id: 'file-789' }),
      })
      .mockResolvedValueOnce({
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

    const [uploadUrl] = fetchMock.mock.calls[0];
    const [responseUrl, responseOptions] = fetchMock.mock.calls[1];
    expect(uploadUrl).toContain('/v1/files');
    expect(responseUrl).toContain('/v1/responses');
    const body = JSON.parse(responseOptions.body);
    const fileInput = body.input[1].content.find((item: { type: string }) => item.type === 'input_file');
    expect(fileInput.file_id).toBe('file-789');
  });
});
