import { generateCipherReport } from '../cipherEngine';
import { MarketSnapshot, SkillInput, UserProfile } from '../../types';

const baseProfile: UserProfile = {
  name: 'Alex Doe',
  currentRole: 'Product Manager',
  yearsExperience: '6',
  education: 'B.S. Business Administration',
  certifications: 'PMP',
  location: 'New York, NY',
  willingToRelocate: false,
  openToInternational: false,
  age: '34',
  gender: 'Woman',
  raceEthnicity: 'Hispanic/Latino',
  industries: 'Fintech',
  riskTolerance: 'Moderate',
  aiLiteracy: 'Intermediate',
  careerGoals: ['Growth'],
  hobbies: '',
  volunteer: '',
  sideProjects: '',
  notes: '',
};

const baseMarket: MarketSnapshot = {
  updatedAt: '2026-02-05',
  indicators: '',
  hiringTrends: '',
  layoffs: '',
  funding: '',
  aiTrends: '',
  sources: '',
};

const buildResumeText = () => {
  const filler = Array.from({ length: 120 }, () => 'Delivered results').join(' ');
  return `Alex Doe | alex@example.com | 555-555-5555
Summary
Product Manager with fintech experience and strategic planning expertise.
Experience
Product Manager, Fintech Co (2020-2024)
- Led strategic planning initiatives that improved margin.
- Improved data analysis workflows for cross-functional teams.
Education
B.S. Business Administration 2018
Skills
Strategic planning, Data analysis, PMP
${filler}`;
};

describe('generateCipherReport', () => {
  it('ranks skills by market value', () => {
    const skills: SkillInput[] = [
      {
        id: '1',
        name: 'Copywriting',
        category: 'creative',
        years: 2,
        evidence: '',
        enjoyment: 3,
      },
      {
        id: '2',
        name: 'Leadership strategy',
        category: 'leadership',
        years: 8,
        evidence: '',
        enjoyment: 5,
      },
    ];

    const report = generateCipherReport(baseProfile, skills, baseMarket, [], '');
    expect(report.skillsPortfolio[0].name).toBe('Leadership strategy');
    expect(report.skillsPortfolio[1].name).toBe('Copywriting');
  });

  it('returns a low ATS readiness when resume is missing', () => {
    const report = generateCipherReport(baseProfile, [], baseMarket, [], '');
    expect(report.resumeAnalysis?.atsReadiness).toBe('Low');
    expect(report.resumeAnalysis?.flags).toContain(
      'Resume content missing. Upload or paste your resume for ATS scan.'
    );
  });

  it('scores ATS readiness as high for a structured resume', () => {
    const skills: SkillInput[] = [
      {
        id: '1',
        name: 'Strategic planning',
        category: 'leadership',
        years: 5,
        evidence: '',
        enjoyment: 4,
      },
      {
        id: '2',
        name: 'Data analysis',
        category: 'analytical',
        years: 4,
        evidence: '',
        enjoyment: 4,
      },
    ];

    const report = generateCipherReport(
      baseProfile,
      skills,
      baseMarket,
      [],
      buildResumeText()
    );

    expect(report.resumeAnalysis?.atsReadiness).toBe('High');
    expect(report.resumeAnalysis?.atsScore).toBeGreaterThanOrEqual(80);
    expect(report.resumeAnalysis?.missingSections.length).toBe(0);
  });

  it('builds a networking plan when LinkedIn data is available', () => {
    const connections = [
      {
        firstName: 'Jamie',
        lastName: 'Lee',
        email: 'jamie@example.com',
        company: 'Acme',
        position: 'Director of Product',
        connectedOn: '1/1/2024',
        location: 'New York, NY',
      },
    ];

    const report = generateCipherReport(baseProfile, [], baseMarket, connections, '');
    expect(report.networkReport?.totalConnections).toBe(1);
    expect(report.networkReport?.priorityOrder[0]).toContain(baseProfile.currentRole);
  });
});
