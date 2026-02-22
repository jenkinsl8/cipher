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

  it('parses CSV locally without calling OpenAI', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    const rows = Array.from({ length: 970 }, (_, i) => {
      const index = i + 1;
      return `First${index},Last${index},https://linkedin.com/in/user${index},,Company${index},,1/1/2024,`;
    }).join('\n');
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connection on,Location\n${rows}`;
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

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.connections).toHaveLength(970);
    expect(result.connections?.[0]).toMatchObject({
      firstName: 'First1',
      lastName: 'Last1',
      url: 'https://linkedin.com/in/user1',
      email: '',
      company: 'Company1',
      position: '',
      location: '',
    });
    expect(result.connections?.[969]).toMatchObject({
      firstName: 'First970',
      lastName: 'Last970',
      url: 'https://linkedin.com/in/user970',
      email: '',
      company: 'Company970',
      position: '',
      location: '',
    });
  });
});
