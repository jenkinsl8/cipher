import { parseCipherReportWithOpenAI } from '../aiReport';
import { LinkedInConnection, SkillInput, UserProfile } from '../../types';

type FetchPayload = {
  messages: Array<{ role: string; content: string }>;
};

const section = (id: string) => ({
  id,
  title: `${id} title`,
  summary: `${id} summary`,
  bullets: [`${id} bullet`],
});

const mockedResponses = [
  {
    marketSnapshot: section('market-snapshot'),
    marketOutlook: section('market-outlook'),
    geographicOptions: section('geographic-options'),
    internationalPlan: null,
  },
  {
    skillsPortfolio: [],
    aiResilience: section('ai-resilience'),
    competencyMilestones: section('competency-milestones'),
    skillsGapResources: section('skills-gap-resources'),
    learningRoadmap: section('learning-roadmap'),
    projectsToPursue: section('projects-to-pursue'),
  },
  {
    aiForward: section('ai-forward'),
    careerInsights: section('career-insights'),
    careerPaths: [],
    earningsMaximization: section('earnings-maximization'),
    opportunityMap: section('opportunity-map'),
    actionPlan: section('action-plan'),
    gapAnalysis: section('gap-analysis'),
    demographicStrategy: section('demographic-strategy'),
    entrepreneurshipPlan: null,
  },
  {
    resumeAnalysis: null,
  },
  {
    networkReport: null,
  },
];

describe('parseCipherReportWithOpenAI prompt directives', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('instructs Sentinel and Aegis to infer skills and evaluate competitiveness using education vs experience', async () => {
    let invocation = 0;
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = mockedResponses[invocation++];
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(payload) } }],
        }),
      } as Response;
    });

    const profile: UserProfile = {
      name: 'Candidate',
      currentRole: 'Data Analyst',
      yearsExperience: '4',
      education: 'B.S. Computer Science',
      certifications: 'Machine Learning Specialization',
      location: 'Remote',
      willingToRelocate: false,
      openToInternational: false,
      age: '30',
      gender: 'N/A',
      raceEthnicity: 'N/A',
      industries: 'Technology',
      riskTolerance: 'Moderate',
      aiLiteracy: 'Intermediate',
      careerGoals: ['Growth'],
      hobbies: '',
      volunteer: '',
      sideProjects: '',
      notes: '',
    };

    const skills: SkillInput[] = [
      {
        id: '1',
        name: 'Python',
        category: 'technical',
        years: 3,
        evidence: 'Built analytics pipelines',
        enjoyment: 4,
      },
    ];

    const connections: LinkedInConnection[] = [];

    await parseCipherReportWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-test',
      profile,
      resumeText: 'Sample resume text',
      skills,
      connections,
      baseUrl: 'https://example.com',
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    const marketRequest = JSON.parse(calls[0][1].body) as FetchPayload;
    const skillsRequest = JSON.parse(calls[1][1].body) as FetchPayload;

    const marketSystemPrompt = marketRequest.messages[0].content;
    const skillsSystemPrompt = skillsRequest.messages[0].content;

    expect(marketSystemPrompt).toContain('Infer likely skills from certifications, education');
    expect(skillsSystemPrompt).toContain('Infer likely skills from certifications, education');
    expect(marketSystemPrompt).toContain('compare education credentials against practical experience depth');
    expect(marketSystemPrompt).toContain('desired years of experience');
  });
});
