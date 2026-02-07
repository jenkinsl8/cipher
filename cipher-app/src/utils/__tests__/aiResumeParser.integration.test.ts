import JSZip from 'jszip';
import { Buffer } from 'buffer';
import { parseResumeWithOpenAI } from '../aiResumeParser';

const apiKey = process.env.OPENAI_API_KEY;

const createPdfBase64 = () => {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 74 >>
stream
BT
/F1 12 Tf
72 72 Td
(Test Person Resume) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
trailer
<< /Root 1 0 R /Size 5 >>
startxref
999
%%EOF`;
  return Buffer.from(pdf, 'latin1').toString('base64');
};

const createDocxBase64 = async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Test Person Resume</w:t></w:r></w:p>
          <w:p><w:r><w:t>Experience: Product Manager</w:t></w:r></w:p>
        </w:body>
      </w:document>`
  );
  return zip.generateAsync({ type: 'base64' });
};

const runOrSkip = apiKey ? describe : describe.skip;

runOrSkip('OpenAI integration resume parsing', () => {
  jest.setTimeout(30000);

  it('parses a PDF attachment via OpenAI', async () => {
    const result = await parseResumeWithOpenAI({
      apiKey,
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
      resumeText: '',
      file: {
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        data: createPdfBase64(),
      },
    });

    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('warnings');
  });

  it('parses a DOCX attachment via OpenAI', async () => {
    const result = await parseResumeWithOpenAI({
      apiKey,
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
      resumeText: '',
      file: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: await createDocxBase64(),
      },
    });

    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('skills');
    expect(result).toHaveProperty('warnings');
  });
});
