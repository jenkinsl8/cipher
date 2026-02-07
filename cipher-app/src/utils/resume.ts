import JSZip from 'jszip';
import { Buffer } from 'buffer';
import { ResumeExtraction, SkillCategory, SkillInput, UserProfile } from '../types';

const HEADING_MAP: { key: string; labels: string[] }[] = [
  { key: 'summary', labels: ['summary', 'professional summary', 'profile'] },
  { key: 'experience', labels: ['experience', 'work experience', 'employment', 'work history'] },
  { key: 'education', labels: ['education', 'academic'] },
  { key: 'skills', labels: ['skills', 'core competencies', 'expertise'] },
  { key: 'certifications', labels: ['certifications', 'licenses', 'certifications and licenses'] },
  { key: 'projects', labels: ['projects', 'portfolio'] },
  { key: 'volunteer', labels: ['volunteer', 'community'] },
];

const CATEGORY_KEYWORDS: Record<SkillCategory, string[]> = {
  technical: [
    'python',
    'sql',
    'javascript',
    'typescript',
    'cloud',
    'aws',
    'azure',
    'gcp',
    'kubernetes',
    'devops',
    'automation',
    'machine learning',
    'ai',
    'data engineering',
  ],
  'soft/interpersonal': [
    'communication',
    'collaboration',
    'stakeholder',
    'negotiation',
    'presentation',
    'relationship',
    'customer',
    'sales',
    'influence',
  ],
  leadership: [
    'leadership',
    'strategy',
    'management',
    'mentorship',
    'vision',
    'roadmap',
    'executive',
  ],
  analytical: ['analysis', 'analytics', 'data', 'research', 'modeling', 'forecasting'],
  creative: ['design', 'ux', 'ui', 'copywriting', 'content', 'brand', 'creative'],
  'domain-specific': [
    'finance',
    'fintech',
    'healthcare',
    'legal',
    'compliance',
    'security',
    'hr',
    'operations',
    'product',
    'marketing',
  ],
};

const INDUSTRY_KEYWORDS: { industry: string; keywords: string[] }[] = [
  { industry: 'Fintech', keywords: ['fintech', 'bank', 'payments', 'lending', 'finance'] },
  { industry: 'Healthcare', keywords: ['healthcare', 'clinical', 'hospital', 'medical'] },
  { industry: 'SaaS', keywords: ['saas', 'software', 'subscription'] },
  { industry: 'E-commerce', keywords: ['e-commerce', 'ecommerce', 'retail'] },
  { industry: 'Education', keywords: ['education', 'edtech', 'learning'] },
  { industry: 'Cybersecurity', keywords: ['security', 'cyber', 'risk', 'compliance'] },
  { industry: 'Marketing', keywords: ['marketing', 'growth', 'brand', 'content'] },
  { industry: 'Logistics', keywords: ['logistics', 'supply chain', 'operations'] },
];

const HARD_SKILL_KEYWORDS = [
  'project management',
  'program management',
  'product management',
  'data analysis',
  'analytics',
  'sql',
  'python',
  'excel',
  'agile',
  'scrum',
  'roadmapping',
  'go-to-market',
  'user research',
  'machine learning',
  'ai',
  'cloud',
  'devops',
  'security',
  'compliance',
  'finance',
  'budgeting',
  'forecasting',
  'operations',
  'marketing',
  'design',
  'ux',
  'research',
  'content strategy',
  'copywriting',
  'sales',
  'hr',
  'recruiting',
];

const SOFT_SKILL_KEYWORDS = [
  'communication',
  'collaboration',
  'leadership',
  'stakeholder management',
  'strategic planning',
  'negotiation',
  'mentorship',
  'coaching',
  'conflict resolution',
  'presentation',
  'relationship building',
  'customer success',
  'team leadership',
  'executive influence',
  'change management',
  'problem solving',
  'critical thinking',
];

const SKILL_KEYWORDS = [...HARD_SKILL_KEYWORDS, ...SOFT_SKILL_KEYWORDS];

const normalizeLine = (line: string) => line.trim().replace(/\s+/g, ' ');

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripNonPrintable = (value: string) =>
  value.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();

const decodePdfString = (value: string) => {
  const withEscapes = value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');

  return withEscapes.replace(/\\([0-7]{1,3})/g, (match, octal) =>
    String.fromCharCode(parseInt(octal, 8))
  );
};

const toUint8Array = (data: Uint8Array | ArrayBuffer) =>
  data instanceof Uint8Array ? data : new Uint8Array(data);

export const extractTextFromPdfBinary = async (
  data: Uint8Array | ArrayBuffer
): Promise<string> => {
  const buffer = Buffer.from(toUint8Array(data));
  const content = buffer.toString('latin1');
  const parts: string[] = [];

  const tjRegex = /\(([^()]*)\)\s*Tj/g;
  const tjArrayRegex = /\[(.*?)\]\s*TJ/gs;

  for (const match of content.matchAll(tjRegex)) {
    const raw = match[1];
    if (raw) parts.push(decodePdfString(raw));
  }

  for (const match of content.matchAll(tjArrayRegex)) {
    const arrayContent = match[1];
    if (!arrayContent) continue;
    const strings = arrayContent.match(/\(([^()]*)\)/g) || [];
    strings.forEach((entry) => {
      const raw = entry.slice(1, -1);
      if (raw) parts.push(decodePdfString(raw));
    });
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export const extractTextFromDocxBinary = async (
  data: Uint8Array | ArrayBuffer
): Promise<string> => {
  const zip = await JSZip.loadAsync(toUint8Array(data));
  const doc = zip.file('word/document.xml');
  if (!doc) return '';
  const xml = await doc.async('string');
  const paragraphs = xml.split('</w:p>');
  const extracted: string[] = [];

  paragraphs.forEach((paragraph) => {
    const matches = paragraph.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (!matches) return;
    const text = matches
      .map((match) => match.replace(/<w:t[^>]*>/, '').replace('</w:t>', ''))
      .map((segment) => decodeXmlEntities(segment))
      .join(' ');
    if (text.trim()) {
      extracted.push(text.trim());
    }
  });

  return extracted.join('\n').trim();
};

export const extractTextFromDocBinary = async (
  data: Uint8Array | ArrayBuffer
): Promise<string> => {
  const buffer = Buffer.from(toUint8Array(data));
  return stripNonPrintable(buffer.toString('latin1'));
};

const detectHeading = (line: string) => {
  const cleaned = normalizeLine(line).replace(/:+$/, '').toLowerCase();
  for (const heading of HEADING_MAP) {
    if (heading.labels.some((label) => cleaned === label)) {
      return heading.key;
    }
  }
  return null;
};

const extractName = (lines: string[]) => {
  const topLines = lines.slice(0, 6);
  return (
    topLines.find((line) => {
      const trimmed = normalizeLine(line);
      if (!trimmed) return false;
      if (trimmed.includes('@')) return false;
      if (/\d{3,}/.test(trimmed)) return false;
      if (trimmed.toLowerCase().includes('resume')) return false;
      return trimmed.split(' ').length <= 5;
    }) || ''
  );
};

const extractLocation = (lines: string[]) => {
  const text = lines.slice(0, 6).join(' ');
  const match = text.match(/([A-Za-z .'-]+,\s?[A-Z]{2})/);
  return match ? match[1].trim() : '';
};

const extractRoleFromLine = (line: string) => {
  const cleaned = normalizeLine(line);
  const withoutDates = cleaned.replace(/\(.*?\d{4}.*?\)/g, '').trim();
  const splitters = ['|', ' - ', ' at ', ',', '@'];
  for (const splitter of splitters) {
    if (withoutDates.includes(splitter)) {
      return withoutDates.split(splitter)[0].trim();
    }
  }
  return withoutDates;
};

const INFERRED_SOFT_SKILLS: { pattern: RegExp; skills: string[] }[] = [
  { pattern: /lead|led|manage|managed|director|vp|head|chief|principal/i, skills: ['leadership', 'team leadership', 'coaching'] },
  { pattern: /stakeholder|cross-functional|partnered|collaborat/i, skills: ['stakeholder management', 'collaboration'] },
  { pattern: /present|presentation|public speaking|briefed|communicat/i, skills: ['public speaking', 'communication', 'presentation'] },
  { pattern: /facilitat|workshop|alignment/i, skills: ['facilitation', 'consensus building'] },
  { pattern: /negotiat|contract|vendor|procurement/i, skills: ['negotiation', 'vendor management'] },
  { pattern: /mentor|coach|train/i, skills: ['mentorship', 'coaching'] },
];

const inferSkillsFromExperience = (experienceLines: string[]) => {
  const inferred: string[] = [];
  const joined = experienceLines.join(' ');
  INFERRED_SOFT_SKILLS.forEach((rule) => {
    if (rule.pattern.test(joined)) {
      inferred.push(...rule.skills);
    }
  });
  return inferred;
};

const extractYearsExperience = (text: string) => {
  const yearMatches = text.match(/\b(19|20)\d{2}\b/g) || [];
  const years = yearMatches.map((value) => Number(value)).filter((value) => value > 1900);
  if (years.length === 0) return '';
  const earliest = Math.min(...years);
  const currentYear = new Date().getFullYear();
  const diff = Math.max(0, currentYear - earliest);
  return diff ? String(diff) : '';
};

const parseSkillsFromLines = (lines: string[]) => {
  const raw = lines.flatMap((line) =>
    normalizeLine(line)
      .replace(/^[-*]\s*/, '')
      .split(/[,|;/]/)
      .map((item) => item.trim())
  );
  return raw.filter((item) => item.length > 1);
};

const toTitleCase = (value: string) =>
  value
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');

const categorizeSkill = (name: string): SkillCategory => {
  const lower = name.toLowerCase();
  let bestCategory: SkillCategory = 'domain-specific';
  let bestScore = 0;

  (Object.keys(CATEGORY_KEYWORDS) as SkillCategory[]).forEach((category) => {
    const score = CATEGORY_KEYWORDS[category].filter((keyword) => lower.includes(keyword))
      .length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  });

  return bestCategory;
};

export const buildSkillInputsFromNames = (skills: string[]): SkillInput[] =>
  skills.map((skill, index) => ({
    id: `resume-${index}-${skill.toLowerCase().replace(/\s+/g, '-')}`,
    name: toTitleCase(skill),
    category: categorizeSkill(skill),
    years: 1,
    evidence: '',
    enjoyment: 3,
  }));

const extractIndustries = (text: string) => {
  const lower = text.toLowerCase();
  const matches = INDUSTRY_KEYWORDS.filter((entry) =>
    entry.keywords.some((keyword) => lower.includes(keyword))
  ).map((entry) => entry.industry);

  return Array.from(new Set(matches));
};

export const parseResume = (text: string): ResumeExtraction => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { profile: {}, skills: [], warnings: ['Resume text is empty.'], sections: {} };
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim());
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;

  lines.forEach((line) => {
    if (!line) return;
    const heading = detectHeading(line);
    if (heading) {
      currentSection = heading;
      if (!sections[currentSection]) sections[currentSection] = [];
      return;
    }
    if (currentSection) {
      sections[currentSection].push(line);
    }
  });

  const profile: Partial<UserProfile> = {};
  const name = extractName(lines);
  if (name) profile.name = name;

  const location = extractLocation(lines);
  if (location) profile.location = location;

  const experienceLines = sections.experience || [];
  const roleLine = experienceLines.find((line) => line && !/^[-*]/.test(line)) || '';
  const currentRole = roleLine ? extractRoleFromLine(roleLine) : '';
  if (currentRole) profile.currentRole = currentRole;

  const yearsExperience = extractYearsExperience(experienceLines.join(' '));
  if (yearsExperience) profile.yearsExperience = yearsExperience;

  const education = sections.education ? sections.education.slice(0, 2).join(' | ') : '';
  if (education) profile.education = education;

  const certifications = sections.certifications
    ? sections.certifications.slice(0, 3).join(' | ')
    : '';
  if (certifications) profile.certifications = certifications;

  const industries = extractIndustries(trimmed);
  if (industries.length) profile.industries = industries.join(', ');

  const inferredFromExperience = inferSkillsFromExperience(experienceLines);
  const skillLines = sections.skills || [];
  const skillTokens = parseSkillsFromLines(skillLines).map((skill) => skill.toLowerCase());
  const lowerText = trimmed.toLowerCase();
  const matchedKeywords = SKILL_KEYWORDS.filter((keyword) => lowerText.includes(keyword));
  const extractedSkills = Array.from(
    new Set([...skillTokens, ...matchedKeywords, ...inferredFromExperience])
  );

  const skills = buildSkillInputsFromNames(extractedSkills);
  const warnings: string[] = [];

  if (!currentRole) warnings.push('Could not detect current role from resume.');
  if (!education) warnings.push('Could not detect education section from resume.');
  if (!skills.length) warnings.push('No skills detected. Ensure your resume lists skills.');

  const hasSoftSkill = SOFT_SKILL_KEYWORDS.some((keyword) =>
    extractedSkills.some((skill) => skill.includes(keyword))
  );
  const hasHardSkill = HARD_SKILL_KEYWORDS.some((keyword) =>
    extractedSkills.some((skill) => skill.includes(keyword))
  );
  if (!hasSoftSkill) {
    warnings.push('No soft skills detected. Add leadership or communication skills.');
  }
  if (!hasHardSkill) {
    warnings.push('No technical skills detected. Add tools, platforms, or systems.');
  }

  return {
    profile,
    skills,
    warnings,
    sections,
  };
};
