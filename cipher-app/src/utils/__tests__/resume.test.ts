import JSZip from 'jszip';
import { Buffer } from 'buffer';
import {
  extractTextFromDocBase64,
  extractTextFromDocxBase64,
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

  it('falls back to keyword skills when a Skills section is missing', () => {
    const resume = `Jamie Smith
james@example.com
Experience
Program Manager - Growth Team (2017-2023)
- Led project management initiatives and data analysis.`;

    const result = parseResume(resume);
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(['Project Management', 'Data Analysis'])
    );
  });
});

describe('resume extraction helpers', () => {
  it('extracts text from DOCX base64', async () => {
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
    const base64 = await zip.generateAsync({ type: 'base64' });
    const text = await extractTextFromDocxBase64(base64);
    expect(text).toContain('Product Manager');
    expect(text).toContain('Data Analysis');
  });

  it('extracts text from DOC base64 with best-effort parsing', async () => {
    const base64 = Buffer.from('Resume content for DOC format', 'latin1').toString(
      'base64'
    );
    const text = await extractTextFromDocBase64(base64);
    expect(text).toContain('Resume content for DOC format');
  });
});
