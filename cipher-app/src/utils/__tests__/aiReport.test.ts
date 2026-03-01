import { parseCipherReportWithOpenAI } from '../aiReport';
import { LinkedInConnection, SkillInput, UserProfile } from '../../types';

type FetchPayload = {
  response_format: {
    json_schema: {
      name: string;
    };
  };
  messages: Array<{ role: string; content: string }>;
};

const section = (id: string) => ({
  id,
  title: `${id} title`,
  summary: `${id} summary`,
  bullets: [`${id} bullet`],
});

const mockedResponsesByAgent: Record<string, Record<string, unknown>> = {
  market_agent: {
    marketSnapshot: section('market-snapshot'),
    marketOutlook: section('market-outlook'),
    geographicOptions: section('geographic-options'),
    internationalPlan: null,
  },
  skills_agent: {
    skillsPortfolio: [],
    aiResilience: section('ai-resilience'),
    competencyMilestones: section('competency-milestones'),
    skillsGapResources: section('skills-gap-resources'),
    learningRoadmap: section('learning-roadmap'),
    projectsToPursue: section('projects-to-pursue'),
  },
  career_agent: {
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
  ats_agent: {
    resumeAnalysis: null,
  },
  network_agent: {
    networkReport: null,
  },
};

describe('parseCipherReportWithOpenAI prompt directives', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('instructs Sentinel and Aegis to infer skills and evaluate competitiveness using education vs experience', async () => {
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse((init?.body as string) || '{}') as FetchPayload;
      const agentName = request.response_format?.json_schema?.name;
      const payload = agentName ? mockedResponsesByAgent[agentName] : undefined;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(payload || {}) } }],
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
    const requests = calls.map((call) => JSON.parse(call[1].body) as FetchPayload);
    const marketRequest = requests.find(
      (request) => request.response_format.json_schema.name === 'market_agent'
    );
    const skillsRequest = requests.find(
      (request) => request.response_format.json_schema.name === 'skills_agent'
    );

    expect(marketRequest).toBeDefined();
    expect(skillsRequest).toBeDefined();

    const marketSystemPrompt = marketRequest?.messages[0].content ?? '';
    const marketUserPrompt = marketRequest?.messages[1].content ?? '';
    const skillsSystemPrompt = skillsRequest?.messages[0].content ?? '';

    expect(marketSystemPrompt).toContain('Infer likely skills from certifications, education');
    expect(skillsSystemPrompt).toContain('Infer likely skills from certifications, education');
    expect(marketSystemPrompt).toContain('compare education credentials against practical experience depth');
    expect(marketSystemPrompt).toContain('desired years of experience');
    expect(marketSystemPrompt).toContain('Incorporate the skills agent handoff into market analysis');
    expect(marketUserPrompt).toContain('Skills agent handoff from Aegis');
    expect(marketUserPrompt).toContain(
      "Sentinel task: Ask the Aegis handoff for the candidate's top skills and level of experience"
    );
  });


  it('publishes incremental progress and a final completion update', async () => {
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse((init?.body as string) || '{}') as FetchPayload;
      const agentName = request.response_format?.json_schema?.name;
      const payload = agentName ? mockedResponsesByAgent[agentName] : undefined;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(payload || {}) } }],
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

    const updates: Array<{ completedAgents: number; totalAgents: number; done: boolean }> = [];

    await parseCipherReportWithOpenAI({
      apiKey: 'test-key',
      model: 'gpt-test',
      profile,
      resumeText: 'Sample resume text',
      skills,
      connections: [],
      baseUrl: 'https://example.com',
      onProgress: ({ completedAgents, totalAgents, done }) => {
        updates.push({ completedAgents, totalAgents, done });
      },
    });

    expect(updates.length).toBe(6);
    expect(updates.slice(0, 5).every((step) => !step.done)).toBe(true);
    expect(updates[5].done).toBe(true);
    expect(updates[5].completedAgents).toBe(5);
    expect(updates[5].totalAgents).toBe(5);
  });
});
