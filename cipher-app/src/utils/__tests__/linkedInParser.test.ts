import { parseLinkedInWithOpenAI } from '../linkedInParser';

describe('parseLinkedInWithOpenAI', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sends PDF as file input', async () => {
    const payload = { connections: [{ firstName: 'Ava' }], warnings: [] };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    });

    const result = await parseLinkedInWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-test',
      file: {
        name: 'connections.pdf',
        mimeType: 'application/pdf',
        data: 'dGVzdA==',
      },
    });

    expect(result.connections?.length).toBe(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(Array.isArray(body.messages[1].content)).toBe(true);
    expect(body.messages[1].content[0].file.file_data).toBe(
      'data:application/pdf;base64,dGVzdA=='
    );
  });

  it('uses text prompt for CSV and avoids file input payload', async () => {
    const payload = { connections: [{ firstName: 'Sam' }], warnings: [] };
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
    });

    const csv = 'First Name,Last Name\nSam,Lee';
    const base64 = Buffer.from(csv, 'utf8').toString('base64');

    const result = await parseLinkedInWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-test',
      file: {
        name: 'connections.csv',
        mimeType: 'text/csv',
        data: base64,
      },
    });

    expect(result.connections?.[0]?.firstName).toBe('Sam');

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(typeof body.messages[1].content).toBe('string');
    expect(body.messages[1].content).toContain('First Name,Last Name');
    expect(body.messages[1].content).not.toContain('"type":"file"');
  });
});
