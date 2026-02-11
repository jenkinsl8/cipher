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

const buildContextBlock = ({
  profile,
  resumeText,
  skills,
  connections,
}: {
  profile: UserProfile;
  resumeText: string;
  skills: SkillInput[];
  connections: LinkedInConnection[];
}) => {
  const parsedResumeProfile = {
    currentRole: profile.currentRole || 'Unknown',
    yearsExperience: profile.yearsExperience || 'Unknown',
    education: profile.education || 'Unknown',
    certifications: profile.certifications || 'Unknown',
    location: profile.location || 'Unknown',
    industries: profile.industries || 'Unknown',
  };
  const parsedResumeSkills = skills.map((skill) => ({
    name: skill.name,
    category: skill.category,
    years: skill.years,
    evidence: skill.evidence,
  }));
  const parsedResumeSkillNames = parsedResumeSkills.map((skill) => skill.name.toLowerCase());

  return `Parsed resume profile (source of truth):
${JSON.stringify(parsedResumeProfile, null, 2)}

Full user profile:
${JSON.stringify(profile, null, 2)}

Resume text (may be truncated):
${resumeText}

Parsed resume skills:
${JSON.stringify(parsedResumeSkills, null, 2)}

Parsed resume skill names (quick reference):
${JSON.stringify(parsedResumeSkillNames, null, 2)}

LinkedIn connections sample:
${JSON.stringify(connections, null, 2)}

Instruction: Use the parsed resume profile and parsed resume skills above for all analysis, including market conditions and follow-up recommendations. Do not tell the user to acquire a skill that already appears in parsed resume skills.`;
};

const sourceRules = `Use ONLY public, reliable data sources (BLS, O*NET, WEF, OECD, ILO,
LinkedIn Workforce Reports, World Bank, IMF, government labor stats, reputable salary surveys).
Always cite sources with URLs in bullets when giving market, salary, or industry claims.
For international outlooks, prioritize World Economic Forum, ILO, and other globally recognized
labor market sources. Be conservative and realistic. If data is unknown, state assumptions and what to verify.`;

const recommendationRules =
  'Never recommend acquiring a skill that already appears in parsed resume skills. For existing skills, recommend deeper application, proof of impact, specialization, or adjacent upskilling instead.';

const inferredSkillRules =
  'Infer likely skills from certifications, education, and described accomplishments even when a skill is not explicitly listed in parsed resume skills. Treat inferred skills as candidate strengths when supported by evidence, and review experience for proof of applied use before calling it a gap.';

const skillsToMarketHandoffRules =
  'Incorporate the skills agent handoff into market analysis. Use it to calibrate demand assumptions, explain competitive positioning, and refine geographic or international recommendations.';

const competitivenessRules =
  'When assessing competitiveness, compare education credentials against practical experience depth. Evaluate how the market values each by referencing representative job descriptions for target roles, especially required/preferred education and desired years of experience, and explain tradeoffs clearly.';

const callAgent = async <T>({
  apiKey,
  model,
  baseUrl,
  schemaName,
  schema,
  systemPrompt,
  userPrompt,
}: {
  apiKey: string;
  model: string;
  baseUrl: string;
  schemaName: string;
  schema: object;
  systemPrompt: string;
  userPrompt: string;
}): Promise<T> => {
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
        json_schema: {
          name: schemaName,
          schema,
          strict: true,
        },
      },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI agent failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('AI agent returned empty response.');
  }

  const parsed = extractJsonFromText(content);
  if (!parsed) {
    throw new Error('AI agent returned invalid JSON.');
  }

  return parsed as T;
};

const marketAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    marketSnapshot: reportSectionSchema,
    marketOutlook: reportSectionSchema,
    geographicOptions: reportSectionSchema,
    internationalPlan: {
      anyOf: [reportSectionSchema, { type: 'null' }],
    },
  },
  required: ['marketSnapshot', 'marketOutlook', 'geographicOptions', 'internationalPlan'],
};

const skillsAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    skillsPortfolio: { type: 'array', items: skillInsightSchema },
    aiResilience: reportSectionSchema,
    competencyMilestones: reportSectionSchema,
    skillsGapResources: reportSectionSchema,
    learningRoadmap: reportSectionSchema,
    projectsToPursue: reportSectionSchema,
  },
  required: [
    'skillsPortfolio',
    'aiResilience',
    'competencyMilestones',
    'skillsGapResources',
    'learningRoadmap',
    'projectsToPursue',
  ],
};

const careerAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    aiForward: reportSectionSchema,
    careerInsights: reportSectionSchema,
    careerPaths: { type: 'array', items: careerPathTierSchema },
    earningsMaximization: reportSectionSchema,
    opportunityMap: reportSectionSchema,
    actionPlan: reportSectionSchema,
    gapAnalysis: reportSectionSchema,
    demographicStrategy: reportSectionSchema,
    entrepreneurshipPlan: {
      anyOf: [reportSectionSchema, { type: 'null' }],
    },
  },
  required: [
    'aiForward',
    'careerInsights',
    'careerPaths',
    'earningsMaximization',
    'opportunityMap',
    'actionPlan',
    'gapAnalysis',
    'demographicStrategy',
    'entrepreneurshipPlan',
  ],
};

const atsAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumeAnalysis: {
      anyOf: [resumeAnalysisSchema, { type: 'null' }],
    },
  },
  required: ['resumeAnalysis'],
};

const networkAgentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    networkReport: {
      anyOf: [networkReportSchema, { type: 'null' }],
    },
  },
  required: ['networkReport'],
};

export const parseCipherReportWithOpenAI = async ({
  apiKey,
  model,
  baseUrl = 'https://api.openai.com',
  profile,
  resumeText,
  skills,
  connections,
  onProgress,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  profile: UserProfile;
  resumeText: string;
  skills: SkillInput[];
  connections: LinkedInConnection[];
  onProgress?: (payload: {
    agent?: 'market' | 'skills' | 'career' | 'ats' | 'network';
    completedAgents: number;
    totalAgents: number;
    report: CipherReport;
    done: boolean;
  }) => void;
}): Promise<CipherReport> => {
  const trimmedResume = resumeText.trim();
  const truncatedResume =
    trimmedResume.length > 8000 ? `${trimmedResume.slice(0, 8000)}\n...[truncated]` : trimmedResume;
  const limitedConnections = connections.slice(0, 60);
  const contextBlock = buildContextBlock({
    profile,
    resumeText: truncatedResume,
    skills,
    connections: limitedConnections,
  });

  const totalAgents = 5;
  const completedAgents = new Set<'market' | 'skills' | 'career' | 'ats' | 'network'>();
  let partialReport: Partial<CipherReport> = {};
  const publishProgress = (
    agent: 'market' | 'skills' | 'career' | 'ats' | 'network',
    payload: Partial<CipherReport>,
    done = false
  ) => {
    partialReport = { ...partialReport, ...payload };
    completedAgents.add(agent);
    onProgress?.({
      agent,
      completedAgents: completedAgents.size,
      totalAgents,
      report: normalizeAiReport(partialReport),
      done,
    });
  };

  const skillsPromise = callAgent<
    Pick<CipherReport, 'skillsPortfolio' | 'aiResilience' | 'competencyMilestones' | 'skillsGapResources' | 'learningRoadmap' | 'projectsToPursue'>
  >(
      {
        apiKey,
        model,
        baseUrl,
        schemaName: 'skills_agent',
        schema: skillsAgentSchema,
        systemPrompt:
          `You are Aegis, a skills and AI impact analyst.\n${sourceRules}\n${recommendationRules}\n${inferredSkillRules}\n` +
          `Return skillsPortfolio, aiResilience, competencyMilestones, skillsGapResources, ` +
          `learningRoadmap, and projectsToPursue. Use ids: ai-resilience, competency-milestones, ` +
          `skills-gap-resources, learning-roadmap, projects-to-pursue.`,
        userPrompt: `${contextBlock}\n\nRespond with JSON only.`,
      }
    ).then((data) => {
      publishProgress('skills', data);
      return data;
    });

  const marketPromise = skillsPromise.then((skillsData) =>
    callAgent<
      Pick<CipherReport, 'marketSnapshot' | 'marketOutlook' | 'geographicOptions' | 'internationalPlan'>
    >({
      apiKey,
      model,
      baseUrl,
      schemaName: 'market_agent',
      schema: marketAgentSchema,
      systemPrompt:
        `You are Sentinel, a market conditions analyst.\n${sourceRules}\n${recommendationRules}\n${inferredSkillRules}\n${skillsToMarketHandoffRules}\n${competitivenessRules}\n` +
        `Return marketSnapshot, marketOutlook, geographicOptions, and internationalPlan.\n` +
        `Use ids: market-snapshot, market-outlook, geographic-options, international-plan.`,
      userPrompt:
        `${contextBlock}\n\nSkills agent handoff from Aegis (source of truth for assessed strengths and gaps):\n` +
        `${JSON.stringify(skillsData, null, 2)}\n\nRespond with JSON only.`,
    }).then((data) => {
      publishProgress('market', data);
      return data;
    })
  );

  const careerPromise = callAgent<
    Pick<CipherReport, 'aiForward' | 'careerInsights' | 'careerPaths' | 'earningsMaximization' | 'opportunityMap' | 'actionPlan' | 'gapAnalysis' | 'demographicStrategy' | 'entrepreneurshipPlan'>
  >(
      {
        apiKey,
        model,
        baseUrl,
        schemaName: 'career_agent',
        schema: careerAgentSchema,
        systemPrompt:
          `You are Atlas, a career path strategist.\n${sourceRules}\n${recommendationRules}\n` +
          `Return aiForward, careerInsights, careerPaths (Traditional/Alternate/Moonshot), ` +
          `earningsMaximization, opportunityMap, actionPlan, gapAnalysis, demographicStrategy, ` +
          `and entrepreneurshipPlan. Use ids: ai-forward, career-insights, earnings-maximization, ` +
          `opportunity-map, action-plan, gap-analysis, demographic-strategy, entrepreneurship-plan.`,
        userPrompt: `${contextBlock}\n\nRespond with JSON only.`,
      }
    ).then((data) => {
      publishProgress('career', data);
      return data;
    });

  const atsPromise = callAgent<Pick<CipherReport, 'resumeAnalysis'>>({
      apiKey,
      model,
      baseUrl,
      schemaName: 'ats_agent',
      schema: atsAgentSchema,
      systemPrompt:
        `You are an ATS analyst.\n${sourceRules}\nReturn resumeAnalysis (or null if no resume text).`,
      userPrompt: `${contextBlock}\n\nRespond with JSON only.`,
    }).then((data) => {
      publishProgress('ats', data);
      return data;
    });

  const networkPromise = callAgent<Pick<CipherReport, 'networkReport'>>({
      apiKey,
      model,
      baseUrl,
      schemaName: 'network_agent',
      schema: networkAgentSchema,
      systemPrompt:
        `You are Nexus, a networking strategy analyst.\n${sourceRules}\n` +
        `Return networkReport or null if there are no connections.`,
      userPrompt: `${contextBlock}\n\nRespond with JSON only.`,
    }).then((data) => {
      publishProgress('network', data);
      return data;
    });

  const [marketData, skillsData, careerData, atsData, networkData] = await Promise.all([
    marketPromise,
    skillsPromise,
    careerPromise,
    atsPromise,
    networkPromise,
  ]);

  const finalReport = normalizeAiReport({
    ...marketData,
    ...skillsData,
    ...careerData,
    ...atsData,
    ...networkData,
  });

  onProgress?.({
    completedAgents: totalAgents,
    totalAgents,
    report: finalReport,
    done: true,
  });

  return finalReport;
};
