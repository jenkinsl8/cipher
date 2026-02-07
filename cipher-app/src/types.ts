export type SkillCategory =
  | 'technical'
  | 'soft/interpersonal'
  | 'leadership'
  | 'analytical'
  | 'creative'
  | 'domain-specific';

export type RiskLevel = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';

export type RiskTolerance = 'Low' | 'Moderate' | 'High';

export type AILiteracy = 'Beginner' | 'Intermediate' | 'Advanced';

export type CareerGoal = 'Stability' | 'Growth' | 'Entrepreneurship';

export type SkillInput = {
  id: string;
  name: string;
  category: SkillCategory;
  years: number;
  evidence: string;
  enjoyment: number;
};

export type UserProfile = {
  name: string;
  currentRole: string;
  yearsExperience: string;
  education: string;
  certifications: string;
  location: string;
  willingToRelocate: boolean;
  openToInternational: boolean;
  age: string;
  gender: string;
  raceEthnicity: string;
  industries: string;
  riskTolerance: RiskTolerance;
  aiLiteracy: AILiteracy;
  careerGoals: CareerGoal[];
  hobbies: string;
  volunteer: string;
  sideProjects: string;
  notes: string;
};

export type MarketSnapshot = {
  updatedAt: string;
  indicators: string;
  hiringTrends: string;
  layoffs: string;
  funding: string;
  aiTrends: string;
  sources: string;
};

export type LinkedInConnection = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  position: string;
  connectedOn: string;
  location: string;
};

export type SkillInsight = {
  name: string;
  category: SkillCategory;
  marketValueScore: number;
  demandLevel: string;
  scarcity: string;
  compensationPremium: string;
  futureProofing: string;
  aiRisk: RiskLevel;
  aiImpactTimeline: string;
  aiRiskReasoning: string;
  aiCan: string;
  aiCannot: string;
  aiTools: string[];
  transformation: string;
  humanEdge: string;
  industryOutlook: {
    industries: string[];
    notes: string;
    sources: string[];
  };
  valueMaintenance: string[];
  aiResistantSignals: string[];
  projections: {
    threeYear: string;
    fiveYear: string;
    tenYear: string;
  };
};

export type ReportSection = {
  id: string;
  title: string;
  summary: string;
  bullets?: string[];
};

export type CareerPathTier = {
  tier: string;
  title: string;
  overview: string;
  riskReward: string;
  earningPotential: string;
  demographicNotes: string[];
  threeYearPlan: {
    year1: string[];
    year2: string[];
    year3: string[];
  };
  fiveYearPlan: {
    year4: string[];
    year5: string[];
  };
  learningPath: string[];
  projects: string[];
  earningsStrategy: string[];
  examples: string[];
  differentials: string[];
  aiResilience: string;
};

export type NetworkReport = {
  totalConnections: number;
  industryBreakdown: string[];
  seniorityBreakdown: string[];
  companyBreakdown: string[];
  geographyBreakdown: string[];
  hiringManagers: string[];
  recruiters: string[];
  warmIntroductions: string[];
  priorityOrder: string[];
  outreachTemplates: string[];
  whatToAsk: string[];
  gaps: string[];
  actionPlan: string[];
};

export type ResumeAnalysis = {
  atsScore: number;
  atsReadiness: 'Low' | 'Moderate' | 'High';
  atsSummary: string;
  wordCount: number;
  keywordCoverage: number;
  sectionsPresent: string[];
  missingSections: string[];
  flags: string[];
  recommendations: string[];
};

export type ResumeExtraction = {
  profile: Partial<UserProfile>;
  skills: SkillInput[];
  warnings: string[];
  sections: Record<string, string[]>;
};

export type CipherReport = {
  marketSnapshot: ReportSection;
  skillsPortfolio: SkillInsight[];
  aiResilience: ReportSection;
  aiForward: ReportSection;
  demographicStrategy: ReportSection;
  careerInsights: ReportSection;
  careerPaths: CareerPathTier[];
  learningRoadmap: ReportSection;
  skillsGapResources: ReportSection;
  competencyMilestones: ReportSection;
  projectsToPursue: ReportSection;
  earningsMaximization: ReportSection;
  opportunityMap: ReportSection;
  gapAnalysis: ReportSection;
  geographicOptions: ReportSection;
  internationalPlan?: ReportSection;
  entrepreneurshipPlan?: ReportSection;
  resumeAnalysis?: ResumeAnalysis;
  actionPlan: ReportSection;
  marketOutlook: ReportSection;
  networkReport?: NetworkReport;
};
