import JSZip from 'jszip';
import { Buffer } from 'buffer';
import {
  extractTextFromDocBinary,
  extractTextFromDocxBinary,
  extractTextFromPdfBinary,
  parseResume,
} from '../resume';

describe('parseResume', () => {
  it('extracts profile fields and skills from a structured resume', () => {
    const resume = `Alex Doe
New York, NY
alex@example.com
Summary
Product leader with fintech experience.
Experience
Product Manager | Acme Corp (2019-2024)
- Led roadmap delivery and analytics improvements.
Education
B.S. Economics, State University
Certifications
PMP
Skills
Strategic planning, data analysis, SQL`;

    const result = parseResume(resume);
    expect(result.profile.name).toBe('Alex Doe');
    expect(result.profile.currentRole).toBe('Product Manager');
    expect(result.profile.education).toContain('B.S. Economics');
    expect(result.profile.certifications).toContain('PMP');
    expect(result.profile.location).toBe('New York, NY');
    expect(result.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(['Strategic Planning', 'Data Analysis', 'Sql'])
    );
  });

  it('returns no skills when a Skills section is missing', () => {
    const resume = `Jamie Smith
james@example.com
Experience
Program Manager - Growth Team (2017-2023)
- Led project management initiatives and data analysis.`;

    const result = parseResume(resume);
    expect(result.skills.length).toBe(0);
  });

  it('includes both soft and hard skills when available', () => {
    const resume = `Taylor Lee
Summary
Collaborative leader with strong communication and negotiation skills.
Experience
Program Manager (2018-2024)
- Led cross-functional teams and stakeholder management.
Skills
SQL, Cloud, Leadership, Communication`;

    const result = parseResume(resume);
    const names = result.skills.map((skill) => skill.name);
    expect(names).toEqual(
      expect.arrayContaining(['Sql', 'Cloud', 'Leadership', 'Communication'])
    );
  });

  it('does not infer skills without a Skills section', () => {
    const resume = `Morgan Reed
Experience
Senior Manager (2019-2024)
- Led cross-functional teams and facilitated stakeholder workshops.
- Presented quarterly results to executive leadership.`;

    const result = parseResume(resume);
    expect(result.skills.length).toBe(0);
  });
});

describe('resume extraction helpers', () => {
  it('extracts text from DOCX binary', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Product Manager</w:t></w:r></w:p>
          <w:p><w:r><w:t>Data Analysis</w:t></w:r></w:p>
        </w:body>
      </w:document>`
    );
    const binary = await zip.generateAsync({ type: 'uint8array' });
    const text = await extractTextFromDocxBinary(binary);
    expect(text).toContain('Product Manager');
    expect(text).toContain('Data Analysis');
  });

  it('extracts text from DOC binary with best-effort parsing', async () => {
    const binary = new Uint8Array(
      Buffer.from('Resume content for DOC format', 'latin1')
    );
    const text = await extractTextFromDocBinary(binary);
    expect(text).toContain('Resume content for DOC format');
  });

  it('extracts text from PDF binary with best-effort parsing', async () => {
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
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 72 Td
(Hello PDF Resume) Tj
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
    const binary = new Uint8Array(Buffer.from(pdf, 'latin1'));
    const text = await extractTextFromPdfBinary(binary);
    expect(text).toContain('Hello PDF Resume');
  });
});
