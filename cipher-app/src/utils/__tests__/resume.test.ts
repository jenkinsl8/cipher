import { parseResume } from '../resume';

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
