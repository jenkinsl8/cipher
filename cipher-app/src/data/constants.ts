import { SkillCategory } from '../types';

export const SKILL_CATEGORIES: { label: string; value: SkillCategory }[] = [
  { label: 'Technical', value: 'technical' },
  { label: 'Soft/Interpersonal', value: 'soft/interpersonal' },
  { label: 'Leadership', value: 'leadership' },
  { label: 'Analytical', value: 'analytical' },
  { label: 'Creative', value: 'creative' },
  { label: 'Domain-Specific', value: 'domain-specific' },
];

export const CATEGORY_SIGNALS: Record<
  SkillCategory,
  {
    demand: number;
    scarcity: number;
    compPremium: number;
    futureProof: number;
    aiRisk: 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';
    timeline: string;
  }
> = {
  technical: {
    demand: 8,
    scarcity: 7,
    compPremium: 8,
    futureProof: 7,
    aiRisk: 'Moderate',
    timeline: '3-5 years',
  },
  'soft/interpersonal': {
    demand: 7,
    scarcity: 6,
    compPremium: 6,
    futureProof: 9,
    aiRisk: 'Low',
    timeline: '10+ years',
  },
  leadership: {
    demand: 7,
    scarcity: 6,
    compPremium: 9,
    futureProof: 9,
    aiRisk: 'Very Low',
    timeline: '10+ years',
  },
  analytical: {
    demand: 8,
    scarcity: 6,
    compPremium: 7,
    futureProof: 6,
    aiRisk: 'Moderate',
    timeline: '3-5 years',
  },
  creative: {
    demand: 6,
    scarcity: 5,
    compPremium: 6,
    futureProof: 5,
    aiRisk: 'High',
    timeline: '1-3 years',
  },
  'domain-specific': {
    demand: 7,
    scarcity: 6,
    compPremium: 7,
    futureProof: 6,
    aiRisk: 'Moderate',
    timeline: '3-5 years',
  },
};

export const KEYWORD_RULES: {
  keywords: string[];
  adjust: { demand?: number; scarcity?: number; compPremium?: number; futureProof?: number };
  aiRisk?: 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';
  timeline?: string;
  tools?: string[];
}[] = [
  {
    keywords: ['ai', 'ml', 'machine learning', 'llm', 'data science', 'prompt'],
    adjust: { demand: 2, scarcity: 2, compPremium: 2, futureProof: 2 },
    aiRisk: 'Low',
    timeline: '10+ years',
    tools: ['OpenAI', 'Hugging Face', 'LangChain', 'Vertex AI'],
  },
  {
    keywords: ['cloud', 'devops', 'kubernetes', 'aws', 'azure', 'gcp'],
    adjust: { demand: 2, scarcity: 1, compPremium: 2, futureProof: 1 },
    aiRisk: 'Low',
    timeline: '5-10 years',
    tools: ['AWS Bedrock', 'Azure OpenAI', 'Google Vertex AI'],
  },
  {
    keywords: ['cyber', 'security', 'privacy', 'risk'],
    adjust: { demand: 2, scarcity: 2, compPremium: 2, futureProof: 1 },
    aiRisk: 'Low',
    timeline: '5-10 years',
    tools: ['CrowdStrike', 'Splunk', 'Darktrace'],
  },
  {
    keywords: ['sales', 'negotiation', 'account management', 'partnership'],
    adjust: { demand: 1, scarcity: 1, compPremium: 2, futureProof: 2 },
    aiRisk: 'Low',
    timeline: '10+ years',
    tools: ['Gong', 'Outreach', 'Apollo'],
  },
  {
    keywords: ['marketing', 'seo', 'content', 'copywriting', 'growth'],
    adjust: { demand: 1, scarcity: -1, compPremium: 0, futureProof: -1 },
    aiRisk: 'High',
    timeline: '1-3 years',
    tools: ['Jasper', 'Copy.ai', 'HubSpot AI'],
  },
  {
    keywords: ['design', 'ux', 'ui', 'creative'],
    adjust: { demand: 1, scarcity: 0, compPremium: 1, futureProof: 0 },
    aiRisk: 'Moderate',
    timeline: '3-5 years',
    tools: ['Figma AI', 'Adobe Firefly', 'Midjourney'],
  },
  {
    keywords: ['finance', 'fp&a', 'investment', 'accounting', 'audit'],
    adjust: { demand: 1, scarcity: 1, compPremium: 1, futureProof: 0 },
    aiRisk: 'Moderate',
    timeline: '3-5 years',
    tools: ['AlphaSense', 'Bloomberg GPT', 'FactSet'],
  },
  {
    keywords: ['legal', 'compliance', 'policy', 'regulatory'],
    adjust: { demand: 1, scarcity: 1, compPremium: 1, futureProof: 1 },
    aiRisk: 'Low',
    timeline: '5-10 years',
    tools: ['Harvey AI', 'Lexis+ AI', 'CoCounsel'],
  },
  {
    keywords: ['health', 'clinical', 'nursing', 'therapy', 'care'],
    adjust: { demand: 2, scarcity: 2, compPremium: 1, futureProof: 2 },
    aiRisk: 'Low',
    timeline: '5-10 years',
    tools: ['Clinical documentation AI', 'Diagnostic AI'],
  },
  {
    keywords: ['project management', 'program management', 'product management'],
    adjust: { demand: 2, scarcity: 1, compPremium: 2, futureProof: 1 },
    aiRisk: 'Low',
    timeline: '5-10 years',
    tools: ['Jira AI', 'Notion AI', 'Asana AI'],
  },
];

export const CATEGORY_AI_ANALYSIS: Record<
  SkillCategory,
  {
    aiCan: string;
    aiCannot: string;
    transformation: string;
    humanEdge: string;
  }
> = {
  technical: {
    aiCan: 'accelerate coding, debugging, test generation, and documentation',
    aiCannot:
      'own system accountability, risk tradeoffs, and cross-domain architectural decisions',
    transformation:
      'moves builders toward higher-level design, AI toolchain orchestration, and reliability',
    humanEdge: 'systems thinking, ownership, security judgment, and domain adaptation',
  },
  'soft/interpersonal': {
    aiCan: 'draft communications, summarize conversations, and suggest responses',
    aiCannot: 'build trust, read nuanced emotions, or resolve conflict in real time',
    transformation:
      'shifts focus to relationship strategy, stakeholder alignment, and influence',
    humanEdge: 'emotional intelligence, credibility, and rapport',
  },
  leadership: {
    aiCan: 'prepare reports, scenario models, and performance insights',
    aiCannot: 'set vision, make ethical tradeoffs, and carry organizational accountability',
    transformation:
      'frees leaders to invest in strategy, culture, and long-range decision making',
    humanEdge: 'vision, accountability, and talent development',
  },
  analytical: {
    aiCan: 'process large datasets, detect patterns, and run simulations quickly',
    aiCannot: 'frame ambiguous problems or validate insights with business context',
    transformation:
      'shifts analysts toward decision framing, experimentation, and storytelling',
    humanEdge: 'hypothesis design, context synthesis, and executive communication',
  },
  creative: {
    aiCan: 'generate drafts, assets, and variations at scale',
    aiCannot: 'define authentic brand vision or novel creative direction',
    transformation:
      'moves creatives to creative direction, curation, and strategic storytelling',
    humanEdge: 'vision, taste, and narrative leadership',
  },
  'domain-specific': {
    aiCan: 'surface knowledge, automate routine checks, and support documentation',
    aiCannot: 'apply nuanced domain judgment or carry real-world liability',
    transformation:
      'elevates practitioners to higher-stakes decisions and client outcomes',
    humanEdge: 'contextual judgment, accountability, and client trust',
  },
};

export const AI_CAPABILITIES = {
  excelsAt: [
    'Pattern recognition',
    'Data processing',
    'Repetitive tasks',
    'Content generation at scale',
    'Code completion',
    'Language translation',
    'Image and video generation',
    'Structured analysis',
    '24/7 availability',
  ],
  strugglesWith: [
    'Novel problem solving',
    'Emotional intelligence',
    'Physical dexterity in unstructured environments',
    'Ethical judgment',
    'Creative vision vs. execution',
    'Relationship building',
    'Cross-domain context switching',
    'Understanding unstated needs',
    'Accountability and liability',
  ],
  augmentsButNotReplace: [
    'Strategy',
    'Leadership',
    'Negotiation',
    'Complex sales',
    'Crisis management',
    'Mentorship',
    'Innovation direction-setting',
    'Stakeholder management',
  ],
};

export const AI_RESISTANT_CHARACTERISTICS = [
  'High emotional or relational component',
  'Requires physical presence or dexterity',
  'Involves accountability and liability',
  'Demands novel creative vision',
  'Requires cross-domain synthesis',
  'Depends on trust and relationships',
  'Needs real-time adaptation to unstructured situations',
];

export const AI_SKILL_STACK = [
  {
    layer: 'Layer 1 (Foundational)',
    items: ['AI literacy', 'Prompt engineering', 'Capabilities and limitations awareness'],
  },
  {
    layer: 'Layer 2 (Applied)',
    items: ['Using AI tools in your domain', 'Workflow augmentation', 'Quality control'],
  },
  {
    layer: 'Layer 3 (Advanced)',
    items: ['Customization and automation', 'Data governance', 'Model evaluation'],
  },
  {
    layer: 'Layer 4 (Strategic)',
    items: ['AI strategy', 'Vendor evaluation', 'Build vs. buy decisions'],
  },
  {
    layer: 'Layer 5 (Leadership)',
    items: ['Leading AI transformation', 'Change management', 'AI ethics'],
  },
];

export const AI_TOOLS_BY_DOMAIN: Record<string, string[]> = {
  Marketing: ['ChatGPT', 'Jasper', 'Midjourney', 'Copy.ai', 'HubSpot AI'],
  Sales: ['Gong', 'Outreach', 'Apollo', 'ChatGPT for research'],
  Engineering: ['GitHub Copilot', 'Cursor', 'Claude', 'Replit AI'],
  Design: ['Midjourney', 'DALL-E', 'Figma AI', 'Adobe Firefly'],
  Finance: ['Bloomberg GPT', 'AlphaSense', 'Custom LLM applications'],
  Legal: ['Harvey AI', 'CoCounsel', 'Lexis+ AI'],
  Healthcare: ['Clinical AI tools', 'Diagnostic AI', 'Documentation AI'],
  HR: ['HireVue', 'Textio', 'Eightfold AI'],
  Operations: ['Process mining AI', 'Supply chain AI', 'Automation platforms'],
};

export const INDUSTRY_OUTLOOK_BY_CATEGORY: Record<
  SkillCategory,
  { industries: string[]; notes: string; sources: string[] }
> = {
  technical: {
    industries: [
      'Software and cloud services',
      'Financial services technology',
      'Healthcare IT',
      'Cybersecurity',
      'AI infrastructure',
    ],
    notes:
      'BLS data shows sustained demand for software, cloud, and security roles; AI adoption is expanding technical skill premiums.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'O*NET Online',
      'LinkedIn Workforce Reports',
      'World Economic Forum Future of Jobs',
    ],
  },
  analytical: {
    industries: [
      'Finance and risk analytics',
      'Healthcare analytics',
      'Supply chain and logistics',
      'Business intelligence and data platforms',
    ],
    notes:
      'Data and analytics roles remain a priority across regulated industries; AI shifts work toward decision framing and governance.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'Lightcast/Burning Glass labor data',
      'World Economic Forum Future of Jobs',
    ],
  },
  leadership: {
    industries: [
      'Enterprise technology',
      'Healthcare operations',
      'Financial services',
      'Public sector and regulated industries',
    ],
    notes:
      'Leadership roles remain resilient to automation; demand stays high in regulated and complex environments.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'WEF Future of Jobs',
      'McKinsey Global Institute',
    ],
  },
  creative: {
    industries: [
      'Digital marketing and content',
      'Product design and UX',
      'Brand strategy',
      'Media and entertainment',
    ],
    notes:
      'Creative roles are evolving with AI tooling; differentiation comes from strategy, taste, and cross-channel execution.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'LinkedIn Workforce Reports',
      'Adobe/Design industry surveys',
    ],
  },
  'soft/interpersonal': {
    industries: [
      'Client services and consulting',
      'Sales and partnerships',
      'Healthcare and caregiving',
      'People operations',
    ],
    notes:
      'Interpersonal skills remain critical in relationship-driven roles; AI amplifies but does not replace trust and negotiation.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'WEF Future of Jobs',
      'LinkedIn Skills Reports',
    ],
  },
  'domain-specific': {
    industries: [
      'Regulated industries (finance, healthcare, legal)',
      'Insurance and risk',
      'Public sector and compliance',
      'Industry-specific SaaS',
    ],
    notes:
      'Domain expertise keeps strong demand where regulatory risk and accountability are high.',
    sources: [
      'BLS Occupational Outlook Handbook',
      'O*NET Online',
      'Industry salary surveys',
    ],
  },
};

export const MARKET_VALIDATED_RESOURCES = [
  {
    name: 'Coursera (audit mode)',
    url: 'https://www.coursera.org',
    cost: 'Free (audit)',
    time: 'Varies by course',
    recognition: 'High when tied to known universities or employers',
    evidence: 'Frequently cited in job postings and resumes',
  },
  {
    name: 'edX (audit mode)',
    url: 'https://www.edx.org',
    cost: 'Free (audit)',
    time: 'Varies by course',
    recognition: 'High with accredited institutions',
    evidence: 'Widely accepted for continuing education',
  },
  {
    name: 'MIT OpenCourseWare',
    url: 'https://ocw.mit.edu',
    cost: 'Free',
    time: 'Self-paced',
    recognition: 'High for knowledge depth; pairing with projects recommended',
    evidence: 'Recognized as MIT curriculum',
  },
  {
    name: 'Harvard Online (free courses)',
    url: 'https://online-learning.harvard.edu',
    cost: 'Free options available',
    time: 'Varies by course',
    recognition: 'High',
    evidence: 'Well-known institution with employer recognition',
  },
  {
    name: 'freeCodeCamp',
    url: 'https://www.freecodecamp.org',
    cost: 'Free',
    time: '300-1200 hours',
    recognition: 'High for portfolio-based roles',
    evidence: 'Accepted for entry roles when paired with projects',
  },
  {
    name: 'Google Digital Garage',
    url: 'https://learndigital.withgoogle.com',
    cost: 'Free',
    time: '40+ hours',
    recognition: 'Moderate to high for digital roles',
    evidence: 'Cited in marketing and analytics job postings',
  },
  {
    name: 'Salesforce Trailhead',
    url: 'https://trailhead.salesforce.com',
    cost: 'Free',
    time: 'Self-paced',
    recognition: 'High for Salesforce ecosystem roles',
    evidence: 'Explicitly required in Salesforce job postings',
  },
  {
    name: 'DeepLearning.AI',
    url: 'https://www.deeplearning.ai',
    cost: 'Free or low-cost',
    time: '4-12 weeks',
    recognition: 'High for AI fundamentals',
    evidence: 'Referenced in AI job postings and resumes',
  },
  {
    name: 'Fast.ai',
    url: 'https://www.fast.ai',
    cost: 'Free',
    time: '8-12 weeks',
    recognition: 'High for applied AI roles',
    evidence: 'Strong portfolio signal for ML roles',
  },
  {
    name: 'Microsoft Learn (AI)',
    url: 'https://learn.microsoft.com/en-us/training/browse/?products=ai-services',
    cost: 'Free',
    time: 'Self-paced',
    recognition: 'High when paired with Microsoft certifications',
    evidence: 'Maps to Microsoft certification paths',
  },
  {
    name: 'Hugging Face Courses',
    url: 'https://huggingface.co/learn',
    cost: 'Free',
    time: 'Self-paced',
    recognition: 'High for NLP and LLM roles',
    evidence: 'Widely used in AI engineering stacks',
  },
];

export const LOW_COST_OPTIONS = [
  'Industry certifications required in postings (e.g., AWS, PMP, SHRM, CPA)',
  'Professional associations with certification tracks',
  'Community college continuing education',
  'Employer-sponsored learning (negotiate as part of compensation)',
];

export const FORMAL_EDUCATION_OPTIONS = [
  'Accredited degree programs when mandated by licensure',
  'Professional certifications that are legally required',
  'Bootcamps with published placement data',
  'Graduate certificates from recognized institutions',
];
