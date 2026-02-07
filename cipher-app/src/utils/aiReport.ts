import {
  CipherReport,
  LinkedInConnection,
  ReportSection,
  RiskLevel,
  SkillCategory,
  SkillInput,
  UserProfile,
} from '../types';
import { extractJsonFromText } from './aiResumeParser';

const SKILL_CATEGORIES: SkillCategory[] = [
  'technical',
  'soft/interpersonal',
  'leadership',
  'analytical',
  'creative',
  'domain-specific',
];

const RISK_LEVELS: RiskLevel[] = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];
const ATS_READINESS = ['Low', 'Moderate', 'High'] as const;

const reportSectionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    summary: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'title', 'summary', 'bullets'],
};

const careerPathPositionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    fit: { type: 'string' },
  },
  required: ['title', 'fit'],
};

const careerPathTierSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tier: { type: 'string' },
    pathType: { type: 'string', enum: ['Traditional', 'Alternate', 'Moonshot'] },
    feasibility: { type: 'string' },
    positions: { type: 'array', items: careerPathPositionSchema },
    title: { type: 'string' },
    overview: { type: 'string' },
    riskReward: { type: 'string' },
    earningPotential: { type: 'string' },
    demographicNotes: { type: 'array', items: { type: 'string' } },
    threeYearPlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        year1: { type: 'array', items: { type: 'string' } },
        year2: { type: 'array', items: { type: 'string' } },
        year3: { type: 'array', items: { type: 'string' } },
      },
      required: ['year1', 'year2', 'year3'],
    },
    fiveYearPlan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        year4: { type: 'array', items: { type: 'string' } },
        year5: { type: 'array', items: { type: 'string' } },
      },
      required: ['year4', 'year5'],
    },
    learningPath: { type: 'array', items: { type: 'string' } },
    projects: { type: 'array', items: { type: 'string' } },
    earningsStrategy: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: { type: 'string' } },
    differentials: { type: 'array', items: { type: 'string' } },
    aiResilience: { type: 'string' },
  },
  required: [
    'tier',
    'pathType',
    'feasibility',
    'positions',
    'title',
    'overview',
    'riskReward',
    'earningPotential',
    'demographicNotes',
    'threeYearPlan',
    'fiveYearPlan',
    'learningPath',
    'projects',
    'earningsStrategy',
    'examples',
    'differentials',
    'aiResilience',
  ],
};

const skillInsightSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    category: { type: 'string', enum: SKILL_CATEGORIES },
    marketValueScore: { type: 'number' },
    demandLevel: { type: 'string' },
    scarcity: { type: 'string' },
    compensationPremium: { type: 'string' },
    futureProofing: { type: 'string' },
    aiRisk: { type: 'string', enum: RISK_LEVELS },
    aiImpactTimeline: { type: 'string' },
    aiRiskReasoning: { type: 'string' },
    aiCan: { type: 'string' },
    aiCannot: { type: 'string' },
    aiTools: { type: 'array', items: { type: 'string' } },
    transformation: { type: 'string' },
    humanEdge: { type: 'string' },
    industryOutlook: {
      type: 'object',
      additionalProperties: false,
      properties: {
        industries: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        sources: { type: 'array', items: { type: 'string' } },
      },
      required: ['industries', 'notes', 'sources'],
    },
    valueMaintenance: { type: 'array', items: { type: 'string' } },
    aiResistantSignals: { type: 'array', items: { type: 'string' } },
    projections: {
      type: 'object',
      additionalProperties: false,
      properties: {
        threeYear: { type: 'string' },
        fiveYear: { type: 'string' },
        tenYear: { type: 'string' },
      },
      required: ['threeYear', 'fiveYear', 'tenYear'],
    },
  },
  required: [
    'name',
    'category',
    'marketValueScore',
    'demandLevel',
    'scarcity',
    'compensationPremium',
    'futureProofing',
    'aiRisk',
    'aiImpactTimeline',
    'aiRiskReasoning',
    'aiCan',
    'aiCannot',
    'aiTools',
    'transformation',
    'humanEdge',
    'industryOutlook',
    'valueMaintenance',
    'aiResistantSignals',
    'projections',
  ],
};

const resumeAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    atsScore: { type: 'number' },
    atsReadiness: { type: 'string', enum: ATS_READINESS as unknown as string[] },
    atsSummary: { type: 'string' },
    wordCount: { type: 'number' },
    keywordCoverage: { type: 'number' },
    sectionsPresent: { type: 'array', items: { type: 'string' } },
    missingSections: { type: 'array', items: { type: 'string' } },
    flags: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'atsScore',
    'atsReadiness',
    'atsSummary',
    'wordCount',
    'keywordCoverage',
    'sectionsPresent',
    'missingSections',
    'flags',
    'recommendations',
  ],
};

const networkReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    totalConnections: { type: 'number' },
    industryBreakdown: { type: 'array', items: { type: 'string' } },
    seniorityBreakdown: { type: 'array', items: { type: 'string' } },
    companyBreakdown: { type: 'array', items: { type: 'string' } },
    geographyBreakdown: { type: 'array', items: { type: 'string' } },
    hiringManagers: { type: 'array', items: { type: 'string' } },
    recruiters: { type: 'array', items: { type: 'string' } },
    warmIntroductions: { type: 'array', items: { type: 'string' } },
    priorityOrder: { type: 'array', items: { type: 'string' } },
    outreachTemplates: { type: 'array', items: { type: 'string' } },
    whatToAsk: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    actionPlan: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'totalConnections',
    'industryBreakdown',
    'seniorityBreakdown',
    'companyBreakdown',
    'geographyBreakdown',
    'hiringManagers',
    'recruiters',
    'warmIntroductions',
    'priorityOrder',
    'outreachTemplates',
    'whatToAsk',
    'gaps',
    'actionPlan',
  ],
};

const cipherReportSchema = {
  name: 'cipher_report',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      marketSnapshot: reportSectionSchema,
      skillsPortfolio: { type: 'array', items: skillInsightSchema },
      aiResilience: reportSectionSchema,
      aiForward: reportSectionSchema,
      demographicStrategy: reportSectionSchema,
      careerInsights: reportSectionSchema,
      careerPaths: { type: 'array', items: careerPathTierSchema },
      learningRoadmap: reportSectionSchema,
      skillsGapResources: reportSectionSchema,
      competencyMilestones: reportSectionSchema,
      projectsToPursue: reportSectionSchema,
      earningsMaximization: reportSectionSchema,
      opportunityMap: reportSectionSchema,
      gapAnalysis: reportSectionSchema,
      geographicOptions: reportSectionSchema,
      internationalPlan: {
        anyOf: [reportSectionSchema, { type: 'null' }],
      },
      entrepreneurshipPlan: {
        anyOf: [reportSectionSchema, { type: 'null' }],
      },
      resumeAnalysis: {
        anyOf: [resumeAnalysisSchema, { type: 'null' }],
      },
      actionPlan: reportSectionSchema,
      marketOutlook: reportSectionSchema,
      networkReport: {
        anyOf: [networkReportSchema, { type: 'null' }],
      },
    },
    required: [
      'marketSnapshot',
      'skillsPortfolio',
      'aiResilience',
      'aiForward',
      'demographicStrategy',
      'careerInsights',
      'careerPaths',
      'learningRoadmap',
      'skillsGapResources',
      'competencyMilestones',
      'projectsToPursue',
      'earningsMaximization',
      'opportunityMap',
      'gapAnalysis',
      'geographicOptions',
      'internationalPlan',
      'entrepreneurshipPlan',
      'resumeAnalysis',
      'actionPlan',
      'marketOutlook',
      'networkReport',
    ],
  },
  strict: true,
};

const createSection = (id: string, title: string): ReportSection => ({
  id,
  title,
  summary: '',
  bullets: [],
});

export const createEmptyReport = (): CipherReport => ({
  marketSnapshot: createSection('market-snapshot', 'Market Snapshot'),
  skillsPortfolio: [],
  aiResilience: createSection('ai-resilience', 'AI Resilience Assessment'),
  aiForward: createSection('ai-forward', 'AI-Forward Opportunities'),
  demographicStrategy: createSection('demographic-strategy', 'Demographic Strategy'),
  careerInsights: createSection('career-insights', 'Comprehensive Career Insights'),
  careerPaths: [],
  learningRoadmap: createSection('learning-roadmap', 'Competency-Based Learning Roadmap'),
  skillsGapResources: createSection('skills-gap-resources', 'Market-Validated Learning Resources'),
  competencyMilestones: createSection('competency-milestones', 'Competency Milestones'),
  projectsToPursue: createSection('projects-to-pursue', 'Projects and Experiences to Pursue'),
  earningsMaximization: createSection('earnings-maximization', 'Earnings Maximization Strategy'),
  opportunityMap: createSection('opportunity-map', 'Opportunity Map'),
  gapAnalysis: createSection('gap-analysis', 'Gap Analysis'),
  geographicOptions: createSection('geographic-options', 'Multi-Geographic Job Search Strategy'),
  actionPlan: createSection('action-plan', 'Action Plan'),
  marketOutlook: createSection('market-outlook', 'Market Outlook and Projections'),
});

const ensureSection = (section: ReportSection | undefined, fallback: ReportSection) => ({
  ...fallback,
  ...(section || {}),
  bullets: Array.isArray(section?.bullets) ? section?.bullets : fallback.bullets,
});

export const normalizeAiReport = (payload: Partial<CipherReport>): CipherReport => {
  const base = createEmptyReport();
  return {
    ...base,
    ...payload,
    marketSnapshot: ensureSection(payload.marketSnapshot, base.marketSnapshot),
    aiResilience: ensureSection(payload.aiResilience, base.aiResilience),
    aiForward: ensureSection(payload.aiForward, base.aiForward),
    demographicStrategy: ensureSection(payload.demographicStrategy, base.demographicStrategy),
    careerInsights: ensureSection(payload.careerInsights, base.careerInsights),
    learningRoadmap: ensureSection(payload.learningRoadmap, base.learningRoadmap),
    skillsGapResources: ensureSection(payload.skillsGapResources, base.skillsGapResources),
    competencyMilestones: ensureSection(payload.competencyMilestones, base.competencyMilestones),
    projectsToPursue: ensureSection(payload.projectsToPursue, base.projectsToPursue),
    earningsMaximization: ensureSection(payload.earningsMaximization, base.earningsMaximization),
    opportunityMap: ensureSection(payload.opportunityMap, base.opportunityMap),
    gapAnalysis: ensureSection(payload.gapAnalysis, base.gapAnalysis),
    geographicOptions: ensureSection(payload.geographicOptions, base.geographicOptions),
    actionPlan: ensureSection(payload.actionPlan, base.actionPlan),
    marketOutlook: ensureSection(payload.marketOutlook, base.marketOutlook),
    skillsPortfolio: Array.isArray(payload.skillsPortfolio) ? payload.skillsPortfolio : [],
    careerPaths: Array.isArray(payload.careerPaths) ? payload.careerPaths : [],
    internationalPlan: payload.internationalPlan || undefined,
    entrepreneurshipPlan: payload.entrepreneurshipPlan || undefined,
    resumeAnalysis: payload.resumeAnalysis || undefined,
    networkReport: payload.networkReport || undefined,
  };
};

const buildPrompt = ({
  profile,
  resumeText,
  skills,
  connections,
}: {
  profile: UserProfile;
  resumeText: string;
  skills: SkillInput[];
  connections: LinkedInConnection[];
}) => `You are Cipher, an AI orchestrator running multiple agents (market, skills, career paths,
network, ATS). Use ONLY public, reliable data sources (BLS, O*NET, WEF, OECD,
LinkedIn Workforce Reports, World Bank, IMF, government labor stats, reputable salary
surveys). Cite sources with URLs in bullets when giving market, salary, or industry claims.
Be conservative and realistic. If data is unknown, state assumptions and what to verify.

Output must be valid JSON that matches the schema.

User profile:
${JSON.stringify(profile, null, 2)}

Resume text (may be truncated):
${resumeText}

Skills extracted:
${JSON.stringify(
  skills.map((skill) => ({
    name: skill.name,
    category: skill.category,
    years: skill.years,
  })),
  null,
  2
)}

LinkedIn connections sample:
${JSON.stringify(connections, null, 2)}
`;

export const parseCipherReportWithOpenAI = async ({
  apiKey,
  model,
  baseUrl = 'https://api.openai.com',
  profile,
  resumeText,
  skills,
  connections,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  profile: UserProfile;
  resumeText: string;
  skills: SkillInput[];
  connections: LinkedInConnection[];
}): Promise<CipherReport> => {
  const trimmedResume = resumeText.trim();
  const truncatedResume =
    trimmedResume.length > 8000 ? `${trimmedResume.slice(0, 8000)}\n...[truncated]` : trimmedResume;
  const limitedConnections = connections.slice(0, 60);

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: cipherReportSchema,
      },
      messages: [
        {
          role: 'system',
          content:
            'You are Cipher. Produce a comprehensive, cited career analysis report.',
        },
        {
          role: 'user',
          content: buildPrompt({
            profile,
            resumeText: truncatedResume,
            skills,
            connections: limitedConnections,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI report failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('AI report returned empty response.');
  }

  const parsed = extractJsonFromText(content);
  if (!parsed) {
    throw new Error('AI report returned invalid JSON.');
  }

  return normalizeAiReport(parsed as CipherReport);
};
