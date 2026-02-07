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

const DEFAULT_SKILL_CATEGORY: SkillCategory = 'domain-specific';

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

export const buildSkillInputsFromNames = (skills: string[]): SkillInput[] =>
  skills.map((skill, index) => ({
    id: `resume-${index}-${skill.toLowerCase().replace(/\s+/g, '-')}`,
    name: toTitleCase(skill),
    category: DEFAULT_SKILL_CATEGORY,
    years: 1,
    evidence: '',
    enjoyment: 3,
  }));

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

  const skillLines = sections.skills || [];
  const skillTokens = parseSkillsFromLines(skillLines).map((skill) => skill.toLowerCase());
  const extractedSkills = Array.from(new Set([...skillTokens]));

  const skills = buildSkillInputsFromNames(extractedSkills);
  const warnings: string[] = [];

  if (!currentRole) warnings.push('Could not detect current role from resume.');
  if (!education) warnings.push('Could not detect education section from resume.');
  if (!skills.length) warnings.push('No skills detected. Ensure your resume lists skills.');

  return {
    profile,
    skills,
    warnings,
    sections,
  };
};
