import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { parseLinkedInConnections } from './src/utils/csv';
import { parseLinkedInWithOpenAI } from './src/utils/linkedInParser';
import {
  extractTextFromDocBinary,
  extractTextFromDocxBinary,
  extractTextFromPdfBinary,
  parseResume,
} from './src/utils/resume';
import {
  parseResumeWithOpenAI,
  parseResumeWithServerless,
} from './src/utils/aiResumeParser';
import { createEmptyReport, parseCipherReportWithOpenAI } from './src/utils/aiReport';
import { extractJsonFromText } from './src/utils/aiResumeParser';
import {
  AILiteracy,
  CareerGoal,
  CipherReport,
  RiskTolerance,
  UserProfile,
  ResumeExtraction,
} from './src/types';

const initialProfile: UserProfile = {
  name: '',
  currentRole: '',
  yearsExperience: '',
  education: '',
  certifications: '',
  location: '',
  willingToRelocate: false,
  openToInternational: false,
  age: '',
  gender: '',
  raceEthnicity: '',
  industries: '',
  riskTolerance: 'Moderate',
  aiLiteracy: 'Beginner',
  careerGoals: ['Growth'],
  hobbies: '',
  volunteer: '',
  sideProjects: '',
  notes: '',
};

const riskOptions: RiskTolerance[] = ['Low', 'Moderate', 'High'];
const aiOptions: AILiteracy[] = ['Beginner', 'Intermediate', 'Advanced'];
const goalOptions: CareerGoal[] = ['Stability', 'Growth', 'Entrepreneurship'];
const FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AnalysisAgentId = 'market' | 'skills' | 'career' | 'ats' | 'network';

const readAssetBinary = async (asset: DocumentPicker.DocumentPickerAsset) => {
  if (Platform.OS === 'web') {
    const assetFile = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
    if (assetFile) {
      const arrayBuffer = await assetFile.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }

    if (asset.uri) {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

const normalizeBase64 = (value: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  const withoutPrefix = trimmed.includes('base64,')
    ? trimmed.split('base64,')[1]
    : trimmed;
  const compact = withoutPrefix.replace(/\s/g, '');
  const remainder = compact.length % 4;
  if (remainder === 0) return compact;
  if (remainder === 2) return `${compact}==`;
  if (remainder === 3) return `${compact}=`;
  return compact;
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() || '';
      const base64 = result.split(',')[1] || '';
      resolve(normalizeBase64(base64));
    };
    reader.onerror = () => reject(new Error('Failed to read file data.'));
    reader.readAsDataURL(blob);
  });

const readAssetBase64 = async (asset: DocumentPicker.DocumentPickerAsset) => {
  if (Platform.OS === 'web') {
    const assetFile = (asset as DocumentPicker.DocumentPickerAsset & { file?: File }).file;
    if (assetFile) {
      return blobToBase64(assetFile);
    }
    if (asset.uri) {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      return blobToBase64(blob);
    }
  }

  const rawBase64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return normalizeBase64(rawBase64);
};

const isHttpsContext = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
};

const isLocalUrl = (value: string) =>
  value.includes('localhost') || value.includes('127.0.0.1');

const mergeProfile = (
  resumeProfile: Partial<UserProfile>,
  manualProfile: UserProfile
): UserProfile => {
  const merged: UserProfile = { ...manualProfile };

  (Object.keys(manualProfile) as Array<keyof UserProfile>).forEach((key) => {
    const manualValue = manualProfile[key];
    if (typeof manualValue === 'string') {
      if (manualValue.trim()) {
        merged[key] = manualValue;
      } else if (resumeProfile[key]) {
        merged[key] = resumeProfile[key] as UserProfile[typeof key];
      }
    } else {
      merged[key] = manualValue;
    }
  });

  (Object.keys(resumeProfile) as Array<keyof UserProfile>).forEach((key) => {
    const manualValue = manualProfile[key];
    const resumeValue = resumeProfile[key];
    if (typeof manualValue === 'string' && manualValue.trim()) {
      return;
    }
    if (resumeValue !== undefined) {
      merged[key] = resumeValue as UserProfile[typeof key];
    }
  });

  return merged;
};

export default function App() {
  const { width } = useWindowDimensions();
  const isCompact = width < 900;
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [linkedInCsv, setLinkedInCsv] = useState('');
  const [linkedInStatus, setLinkedInStatus] = useState('');
  const [linkedInFilePayload, setLinkedInFilePayload] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [linkedInUploadedAt, setLinkedInUploadedAt] = useState<number | null>(null);
  const [linkedInAiStatus, setLinkedInAiStatus] = useState('');
  const [linkedInAiEnabled, setLinkedInAiEnabled] = useState(true);
  const [activeCard, setActiveCard] = useState('home');
  const [showAtsDetail, setShowAtsDetail] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [resumeStatus, setResumeStatus] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeFilePayload, setResumeFilePayload] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);
  const [resumeUploadedAt, setResumeUploadedAt] = useState<number | null>(null);
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiParserMode, setAiParserMode] = useState<'openai' | 'serverless'>(
    'openai'
  );
  const [aiStatus, setAiStatus] = useState('');
  const [aiResumeExtraction, setAiResumeExtraction] = useState<ResumeExtraction | null>(null);
  const [useAiParser, setUseAiParser] = useState(false);
  const [autoParseEnabled, setAutoParseEnabled] = useState(true);
  const [lastAutoParsed, setLastAutoParsed] = useState('');
  const [aiReport, setAiReport] = useState<CipherReport | null>(null);
  const [aiReportStatus, setAiReportStatus] = useState('');
  const [aiReportUpdatedAt, setAiReportUpdatedAt] = useState<number | null>(null);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [analysisCompletedAgents, setAnalysisCompletedAgents] = useState<AnalysisAgentId[]>([]);
  const [lastAiReportKey, setLastAiReportKey] = useState('');
  const [agentQuestion, setAgentQuestion] = useState('');
  const [agentThread, setAgentThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [agentChatStatus, setAgentChatStatus] = useState('');
  const [marketQuestion, setMarketQuestion] = useState('');
  const [marketThread, setMarketThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [marketChatStatus, setMarketChatStatus] = useState('');
  const [skillsQuestion, setSkillsQuestion] = useState('');
  const [skillsThread, setSkillsThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [skillsChatStatus, setSkillsChatStatus] = useState('');
  const [careerQuestion, setCareerQuestion] = useState('');
  const [careerThread, setCareerThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [careerChatStatus, setCareerChatStatus] = useState('');
  const [atsQuestion, setAtsQuestion] = useState('');
  const [atsThread, setAtsThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [atsChatStatus, setAtsChatStatus] = useState('');
  const [networkQuestion, setNetworkQuestion] = useState('');
  const [networkThread, setNetworkThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [networkChatStatus, setNetworkChatStatus] = useState('');
  const [resumeQuestion, setResumeQuestion] = useState('');
  const [resumeThread, setResumeThread] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [resumeChatStatus, setResumeChatStatus] = useState('');
  const [activeCareerPlanIndex, setActiveCareerPlanIndex] = useState(0);

  const connections = useMemo(
    () => parseLinkedInConnections(linkedInCsv),
    [linkedInCsv]
  );
  const resumeExtraction = useMemo(() => {
    if (useAiParser && aiResumeExtraction) {
      return aiResumeExtraction;
    }
    return parseResume(resumeText);
  }, [useAiParser, aiResumeExtraction, resumeText]);
  const resumeSkills = resumeExtraction.skills;
  const mergedProfile = useMemo(
    () => mergeProfile(resumeExtraction.profile, profile),
    [profile, resumeExtraction.profile]
  );
  const emptyReport = useMemo(() => createEmptyReport(), []);
  const report = aiReport || emptyReport;
  const hasAiReport = !!aiReport;

  const resumeReady = !!resumeText.trim() || !!resumeFilePayload?.data;
  const linkedInReady = !!linkedInFilePayload?.data || connections.length > 0;

  const highRiskCount = report.skillsPortfolio.filter((skill) =>
    skill.aiRisk === 'High' || skill.aiRisk === 'Very High'
  ).length;
  const aiRiskLabel = hasAiReport
    ? highRiskCount
      ? `${highRiskCount} high-risk skills`
      : 'No high-risk skills detected'
    : 'Run AI analysis';
  const marketSignal = hasAiReport
    ? report.marketSnapshot.summary || 'AI market snapshot ready'
    : 'Run AI analysis';
  const topValuableSkills = useMemo(() => {
    return [...report.skillsPortfolio]
      .sort((a, b) => b.marketValueScore - a.marketValueScore)
      .slice(0, 5);
  }, [report.skillsPortfolio]);
  const highDemandSkills = useMemo(() => {
    return report.skillsPortfolio.filter((skill) =>
      skill.demandLevel.toLowerCase().includes('high')
    );
  }, [report.skillsPortfolio]);
  const demandSectors = useMemo(() => {
    const counts = new Map<string, number>();
    highDemandSkills.forEach((skill) => {
      const label = skill.category.replace(/-/g, ' ');
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label]) => label);
  }, [highDemandSkills]);
  const demandIndustries = useMemo(() => {
    const counts = new Map<string, number>();
    highDemandSkills.forEach((skill) => {
      skill.industryOutlook.industries.forEach((industry) => {
        const label = industry.trim();
        if (!label) return;
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label]) => label);
  }, [highDemandSkills]);
  const normalizeSkillName = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9+/#\s.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const getSkillAliases = (value: string) => {
    const normalized = normalizeSkillName(value);
    const aliases = new Set([normalized]);
    const aliasMap: Record<string, string[]> = {
      'ml': ['machine learning', 'machine-learning', 'machine learning engineering'],
      'ai': ['artificial intelligence'],
      'cloud architecture': ['cloud architect', 'cloud solution architecture', 'solution architecture'],
      'solution architecture': ['solutions architecture', 'cloud architecture'],
      'machine learning engineering': ['ml engineering', 'machine learning engineer', 'ml engineer'],
      'devops': ['dev ops', 'platform engineering', 'site reliability engineering'],
      'sre': ['site reliability engineering'],
    };
    Object.entries(aliasMap).forEach(([key, values]) => {
      const normalizedKey = normalizeSkillName(key);
      const normalizedValues = values.map((item) => normalizeSkillName(item));
      if (normalized === normalizedKey || normalizedValues.includes(normalized)) {
        aliases.add(normalizedKey);
        normalizedValues.forEach((item) => aliases.add(item));
      }
    });
    return aliases;
  };
  const skillsAreSimilar = (left: string, right: string) => {
    const leftNormalized = normalizeSkillName(left);
    const rightNormalized = normalizeSkillName(right);
    if (!leftNormalized || !rightNormalized) return false;
    if (leftNormalized === rightNormalized) return true;

    const leftAliases = getSkillAliases(leftNormalized);
    const rightAliases = getSkillAliases(rightNormalized);
    for (const alias of leftAliases) {
      if (rightAliases.has(alias)) return true;
    }

    if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) {
      return true;
    }

    const leftTokens = new Set(leftNormalized.split(/\s+/).filter((token) => token.length > 2));
    const rightTokens = new Set(rightNormalized.split(/\s+/).filter((token) => token.length > 2));
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return overlap > 0 && overlap / Math.max(leftTokens.size, rightTokens.size) >= 0.5;
  };
  const resumeSkillMap = useMemo(() => {
    const entries = resumeSkills.map((skill) => [
      normalizeSkillName(skill.name),
      skill,
    ]);
    return new Map(entries);
  }, [resumeSkills]);
  const matchedDemandSkills = useMemo(
    () =>
      highDemandSkills.filter((skill) =>
        resumeSkills.some((resumeSkill) => skillsAreSimilar(skill.name, resumeSkill.name))
      ),
    [highDemandSkills, resumeSkills]
  );
  const gapDemandSkills = useMemo(
    () =>
      highDemandSkills.filter(
        (skill) => !resumeSkills.some((resumeSkill) => skillsAreSimilar(skill.name, resumeSkill.name))
      ),
    [highDemandSkills, resumeSkills]
  );
  const demandToResumeMatchMap = useMemo(() => {
    const entries = highDemandSkills.map((skill) => {
      const match = resumeSkills.find((resumeSkill) =>
        skillsAreSimilar(skill.name, resumeSkill.name)
      );
      return [normalizeSkillName(skill.name), match] as const;
    });
    return new Map(entries);
  }, [highDemandSkills, resumeSkills]);
  const matchedDemandDetails = useMemo(() => {
    return matchedDemandSkills
      .map((skill) => {
        const resumeSkill =
          demandToResumeMatchMap.get(normalizeSkillName(skill.name)) ||
          resumeSkillMap.get(normalizeSkillName(skill.name));
        return resumeSkill
          ? { name: skill.name, years: resumeSkill.years, evidence: resumeSkill.evidence }
          : null;
      })
      .filter(Boolean) as Array<{ name: string; years: number; evidence: string }>;
  }, [demandToResumeMatchMap, matchedDemandSkills, resumeSkillMap]);
  const inferredFitDetails = useMemo(() => {
    return resumeSkills
      .slice(0, 5)
      .map((skill) => ({
        name: skill.name,
        years: skill.years,
        evidence: skill.evidence,
      }));
  }, [resumeSkills]);
  const parsedYearsExperience = Number.parseInt(
    (mergedProfile.yearsExperience || '').match(/\d+/)?.[0] || '0',
    10
  );
  const aegisHighDemandExperience = useMemo(() => {
    const estimatedYears = Math.max(1, Math.min(8, parsedYearsExperience || 2));
    return highDemandSkills.slice(0, 6).map((skill) => {
      const resumeSkill =
        demandToResumeMatchMap.get(normalizeSkillName(skill.name)) ||
        resumeSkillMap.get(normalizeSkillName(skill.name));
      return {
        name: skill.name,
        years: resumeSkill?.years ?? estimatedYears,
        evidence:
          resumeSkill?.evidence ||
          `Estimated from ${mergedProfile.yearsExperience || 'overall profile experience'} with Aegis high-demand ranking.`,
        source: resumeSkill ? 'resume' : 'aegis-estimated',
      };
    });
  }, [
    demandToResumeMatchMap,
    highDemandSkills,
    mergedProfile.yearsExperience,
    parsedYearsExperience,
    resumeSkillMap,
  ]);

  const aegisHandoffDetails = aegisHighDemandExperience.length
    ? aegisHighDemandExperience
    : matchedDemandDetails.length
      ? matchedDemandDetails
      : inferredFitDetails;
  const fitStandoutDetails = matchedDemandDetails.length
    ? matchedDemandDetails
    : inferredFitDetails;
  const fitCoveragePct = highDemandSkills.length
    ? Math.round((matchedDemandSkills.length / highDemandSkills.length) * 100)
    : fitStandoutDetails.length
      ? 60
      : 0;
  const fitInferenceNote =
    matchedDemandDetails.length === 0 && fitStandoutDetails.length > 0
      ? 'No exact demand-skill match was found, so this fit is inferred from your resume skills and experience.'
      : '';

  const sentinelWaitingOnAegis =
    aiReportLoading && !analysisCompletedAgents.includes('skills');

  const fitSynopsis = useMemo(() => {
    const tone = fitCoveragePct >= 70 ? 'Strong' : fitCoveragePct >= 40 ? 'Developing' : 'Early';
    const hasExactDemandMatch = matchedDemandDetails.length > 0;
    const leadSkill =
      (hasExactDemandMatch
        ? matchedDemandDetails[0]?.name
        : inferredFitDetails[0]?.name || fitStandoutDetails[0]?.name) ||
      'core role skills';
    const topGap =
      gapDemandSkills.find((skill) => skill.name !== leadSkill)?.name ||
      gapDemandSkills[0]?.name ||
      'advanced specialization';

    if (!hasExactDemandMatch) {
      return `${tone} global fit: Your strongest signal is ${leadSkill}, based on inferred resume evidence. To strengthen international competitiveness, prioritize ${topGap}.`;
    }

    return `${tone} global fit: You align best through ${leadSkill}. To strengthen international competitiveness, prioritize ${topGap}.`;
  }, [fitCoveragePct, fitStandoutDetails, gapDemandSkills, inferredFitDetails, matchedDemandDetails]);
  const derivedCertifications = useMemo(() => {
    const fromProfile = (mergedProfile.certifications || '')
      .split(/[,;\n•]/)
      .map((value) => value.trim())
      .filter(Boolean);
    const fromResumeText = resumeText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          /certif|certificate|certified|license|licen[cs]e|pmp|cissp|itil|six sigma|aws|azure|google cloud/i.test(
            line
          )
      )
      .slice(0, 6);
    return [...new Set([...fromProfile, ...fromResumeText])];
  }, [mergedProfile.certifications, resumeText]);

  const missingResumeSignals = useMemo(() => {
    const missing: string[] = [];
    if (!mergedProfile.currentRole?.trim()) missing.push('Current role');
    if (!mergedProfile.yearsExperience?.trim()) missing.push('Years of experience');
    if (!mergedProfile.education?.trim()) missing.push('Education');
    if (!derivedCertifications.length) missing.push('Certifications');
    if (resumeSkills.length === 0) missing.push('Skills list');
    return missing;
  }, [mergedProfile, resumeSkills.length, derivedCertifications.length]);
  const marketScopes = useMemo(() => {
    const scopes = [
      {
        key: 'international',
        label: 'International',
        enabled: profile.openToInternational,
        subtitle: 'Global demand signals and cross-border opportunities.',
      },
      {
        key: 'national',
        label: 'National',
        enabled: true,
        subtitle: 'Country-wide trends and hiring momentum.',
      },
      {
        key: 'regional',
        label: 'Regional',
        enabled: true,
        subtitle: `Regional focus near ${mergedProfile.location || 'your area'}.`,
      },
      {
        key: 'local',
        label: 'Local',
        enabled: true,
        subtitle: `Local demand around ${mergedProfile.location || 'your city'}.`,
      },
    ];
    return scopes.filter((scope) => scope.enabled);
  }, [profile.openToInternational, mergedProfile.location]);

  const locationParts = useMemo(() => {
    const raw = mergedProfile.location || '';
    const parts = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return {
      city: parts[0] || 'your city',
      region: parts[1] || parts[0] || 'your region',
      country: parts[parts.length - 1] || 'your country',
    };
  }, [mergedProfile.location]);

  const internationalCountryByIndustry: Record<string, string[]> = {
    finance: ['Singapore', 'United Kingdom', 'United Arab Emirates'],
    healthcare: ['Switzerland', 'Germany', 'United States'],
    software: ['United States', 'Canada', 'Ireland'],
    cybersecurity: ['Israel', 'United States', 'Estonia'],
    manufacturing: ['Germany', 'Japan', 'South Korea'],
    logistics: ['Netherlands', 'Singapore', 'United Arab Emirates'],
    energy: ['Norway', 'United Arab Emirates', 'United States'],
  };

  const inferInternationalMarkets = (industries: string[]) => {
    const matched = industries.flatMap((industry) => {
      const normalized = industry.toLowerCase();
      const hit = Object.entries(internationalCountryByIndustry).find(([key]) =>
        normalized.includes(key)
      );
      return hit ? hit[1].map((country) => ({ country, industry })) : [];
    });
    if (matched.length) return matched.slice(0, 4);
    return [
      { country: 'United States', industry: demandIndustries[0] || 'Technology' },
      { country: 'Germany', industry: demandIndustries[1] || 'Manufacturing' },
      { country: 'Singapore', industry: demandIndustries[2] || 'Finance' },
    ];
  };

  const competitivenessOutlook = useMemo(() => {
    const valueScore = topValuableSkills.length
      ? Math.round(
          topValuableSkills.reduce((sum, skill) => sum + skill.marketValueScore, 0) /
            topValuableSkills.length
        )
      : 50;
    const matchPct = fitCoveragePct;
    const riskPenalty = Math.min(highRiskCount * 4, 20);
    const score = Math.max(5, Math.min(95, Math.round((valueScore + matchPct) / 2 - riskPenalty)));
    return {
      score,
      status: score >= 70 ? 'Positive' : score >= 45 ? 'Neutral' : 'Negative',
      color: score >= 70 ? '#37d67a' : score >= 45 ? '#f6c343' : '#ff6b6b',
    };
  }, [topValuableSkills, fitCoveragePct, highRiskCount]);

  const locationDemandCards = useMemo(() => {
    const baseIndustries = demandIndustries.length
      ? demandIndustries
      : ['Technology', 'Finance', 'Healthcare'];
    const topSkills = highDemandSkills.map((skill) => skill.name).slice(0, 6);
    const standoutSkills = fitStandoutDetails.slice(0, 3).map((skill) => skill.name);
    const internationalMarkets = inferInternationalMarkets(baseIndustries);
    const cards = marketScopes.map((scope, index) => {
      const hiringDelta = Math.max(-12, Math.min(18, fitCoveragePct - 45 + index * 3));
      const trendArrow = hiringDelta > 2 ? '↗' : hiringDelta < -2 ? '↘' : '→';
      const trendLabel = hiringDelta > 2 ? 'Growing' : hiringDelta < -2 ? 'Shrinking' : 'Stagnant';
      const trendColor = hiringDelta > 2 ? '#37d67a' : hiringDelta < -2 ? '#ff6b6b' : '#f6c343';
      const outlookStatus = competitivenessOutlook.status;
      const fitLevel =
        fitCoveragePct >= 70 ? 'High fit' : fitCoveragePct >= 45 ? 'Moderate fit' : 'Needs work';
      const locationLabel =
        scope.key === 'international'
          ? 'Global mobility markets'
          : scope.key === 'national'
            ? locationParts.country
            : scope.key === 'regional'
              ? locationParts.region
              : locationParts.city;
      const industries =
        scope.key === 'international'
          ? internationalMarkets.map((item) => `${item.country} · ${item.industry}`)
          : baseIndustries;
      return {
        ...scope,
        locationLabel,
        industries,
        topSkills,
        standoutSkills,
        fitLevel,
        hiringDelta,
        trendArrow,
        trendLabel,
        trendColor,
        outlookStatus,
        outlookColor: competitivenessOutlook.color,
      };
    });
    return cards;
  }, [
    demandIndustries,
    highDemandSkills,
    fitStandoutDetails,
    marketScopes,
    fitCoveragePct,
    locationParts,
    competitivenessOutlook,
  ]);

  const getRiskTone = (risk: string) => {
    const normalized = risk.toLowerCase();
    if (normalized.includes('very high') || normalized.includes('high')) return 'high';
    if (normalized.includes('medium') || normalized.includes('moderate')) return 'medium';
    return 'low';
  };

  const navItems = [
    { id: 'home', label: 'Main', visible: true },
    { id: 'resume', label: 'Resume Upload', visible: true },
    { id: 'linkedin', label: 'LinkedIn Upload', visible: true },
    { id: 'market', label: 'Market Conditions', visible: resumeReady },
    { id: 'skills', label: 'Skills Analysis', visible: resumeReady },
    { id: 'career', label: 'Career Paths', visible: resumeReady },
    { id: 'ats', label: 'ATS Analysis', visible: resumeReady },
    { id: 'network', label: 'Network Analysis', visible: linkedInReady },
    { id: 'agent-chat', label: 'Agent Console', visible: true },
  ];

  useEffect(() => {
    const visibleIds = navItems.filter((item) => item.visible).map((item) => item.id);
    if (!visibleIds.includes(activeCard)) {
      setActiveCard('home');
    }
  }, [activeCard, resumeReady, linkedInReady]);

  const formatExpiryDate = (uploadedAt: number) =>
    new Date(uploadedAt + FILE_TTL_MS).toISOString().slice(0, 10);
  const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16);
  const buildReportKey = () => {
    const baseText = resumeText.trim() || resumeFilePayload?.name || '';
    const stamp = resumeUploadedAt ? String(resumeUploadedAt) : '';
    return `${baseText.slice(0, 200)}|${stamp}|${resumeSkills.length}`;
  };

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!resumeText.trim() && !resumeFilePayload?.data) missing.push('Resume upload');
    if (!mergedProfile.currentRole?.trim()) missing.push('Current role in resume');
    if (!mergedProfile.location?.trim()) missing.push('Location');
    if (!profile.age.trim()) missing.push('Age');
    if (!profile.gender.trim()) missing.push('Gender');
    if (!profile.raceEthnicity.trim()) missing.push('Race/ethnicity');
    if (resumeSkills.length === 0 && !resumeFilePayload?.data)
      missing.push('Skills in resume');
    if (!hasAiReport) missing.push('Run AI analysis');
    return missing;
  }, [profile, mergedProfile, resumeSkills, resumeText, resumeFilePayload, hasAiReport]);

  useEffect(() => {
    setAiResumeExtraction(null);
    setAiStatus('');
    setUseAiParser(false);
    setLastAutoParsed('');
    setAiReport(null);
    setAiReportUpdatedAt(null);
    setAiReportStatus('');
    setLastAiReportKey('');
    setShowAtsDetail(false);
  }, [resumeText]);

  useEffect(() => {
    if (!resumeUploadedAt || !resumeFilePayload) return;
    const expireAt = resumeUploadedAt + FILE_TTL_MS;
    const now = Date.now();
    if (now >= expireAt) {
      setResumeFilePayload(null);
      setResumeFileName('');
      setResumeUploadedAt(null);
      setResumeStatus('Resume file expired after 7 days. Re-upload to refresh.');
      return;
    }
    const timeout = setTimeout(() => {
      setResumeFilePayload(null);
      setResumeFileName('');
      setResumeUploadedAt(null);
      setResumeStatus('Resume file expired after 7 days. Re-upload to refresh.');
    }, expireAt - now);
    return () => clearTimeout(timeout);
  }, [resumeUploadedAt, resumeFilePayload]);

  useEffect(() => {
    if (!linkedInUploadedAt || !linkedInFilePayload) return;
    const expireAt = linkedInUploadedAt + FILE_TTL_MS;
    const now = Date.now();
    if (now >= expireAt) {
      setLinkedInFilePayload(null);
      setLinkedInUploadedAt(null);
      setLinkedInStatus('LinkedIn file expired after 7 days. Re-upload to refresh.');
      return;
    }
    const timeout = setTimeout(() => {
      setLinkedInFilePayload(null);
      setLinkedInUploadedAt(null);
      setLinkedInStatus('LinkedIn file expired after 7 days. Re-upload to refresh.');
    }, expireAt - now);
    return () => clearTimeout(timeout);
  }, [linkedInUploadedAt, linkedInFilePayload]);

  useEffect(() => {
    setLinkedInStatus('');
    if (!linkedInAiEnabled || !linkedInFilePayload || !aiApiKey.trim()) return;
    const timer = setTimeout(() => {
      handleLinkedInAiParse();
    }, 800);
    return () => clearTimeout(timer);
  }, [linkedInFilePayload, linkedInAiEnabled, aiApiKey, aiModel, aiBaseUrl]);

  const updateProfile = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const toggleGoal = (goal: CareerGoal) => {
    setProfile((prev) => ({
      ...prev,
      careerGoals: prev.careerGoals.includes(goal)
        ? prev.careerGoals.filter((item) => item !== goal)
        : [...prev.careerGoals, goal],
    }));
  };


  const handleLinkedInPick = async () => {
    setLinkedInStatus('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets && result.assets[0];
      if (!asset?.uri) return;
      const base64 = await readAssetBase64(asset);
      if (!base64) {
        setLinkedInStatus('Could not read the LinkedIn file.');
        return;
      }
      setLinkedInFilePayload({
        name: asset.name || 'connections',
        mimeType: asset.mimeType || 'application/octet-stream',
        data: base64,
      });
      setLinkedInUploadedAt(Date.now());
      setLinkedInStatus('LinkedIn file uploaded. Parsing with AI agent...');
    } catch (error) {
      setLinkedInStatus('Could not load the LinkedIn file.');
    }
  };

  const handleLinkedInAiParse = async () => {
    if (!linkedInFilePayload) return;
    if (!aiApiKey.trim()) {
      setLinkedInAiStatus('Add your OpenAI API key to enable LinkedIn AI parsing.');
      return;
    }

    setLinkedInAiStatus('Parsing LinkedIn file with AI agent...');
    try {
      const parsed = await parseLinkedInWithOpenAI({
        apiKey: aiApiKey.trim(),
        model: aiModel.trim() || 'gpt-4o',
        baseUrl: aiBaseUrl.trim() || 'https://api.openai.com',
        file: linkedInFilePayload,
      });
      if (parsed.connections?.length) {
        const rows = parsed.connections
          .map((connection) =>
            [
              connection.firstName,
              connection.lastName,
              connection.email,
              connection.company,
              connection.position,
              connection.connectedOn,
              connection.location,
            ].join(',')
          )
          .join('\n');
        const csv = `First Name,Last Name,Email Address,Company,Position,Connected On,Location\n${rows}`;
        setLinkedInCsv(csv);
        setLinkedInAiStatus(
          `Parsed ${parsed.connections.length} connections with AI agent.`
        );
      } else {
        setLinkedInAiStatus('AI agent did not find any connections.');
      }
    } catch (error) {
      setLinkedInAiStatus(
        error instanceof Error
          ? error.message
          : 'LinkedIn AI parsing failed.'
      );
    }
  };

  const handleResumePick = async () => {
    setResumeStatus('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain',
          'text/markdown',
          'text/rtf',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets && result.assets[0];
      if (!asset?.uri) return;

      const name = asset.name || 'resume';
      setResumeFileName(name);
      setResumeText('');
      setResumeFilePayload(null);
      const lower = name.toLowerCase();
      const extension = lower.split('.').pop() || '';
      const mimeType = asset.mimeType?.toLowerCase() || '';
      const isPlainText =
        extension === 'txt' || extension === 'md' || extension === 'rtf';

      if (extension === 'pdf' || mimeType === 'application/pdf') {
        try {
          const base64 = await readAssetBase64(asset);
          const normalized = normalizeBase64(base64);
          if (!normalized) {
            setResumeStatus('Could not read PDF data for AI parsing.');
            return;
          }
          const binary = await readAssetBinary(asset);
          if (!binary?.length) {
            setResumeStatus('Could not read PDF data. Paste resume text.');
            return;
          }
          setResumeFilePayload({
            name,
            mimeType: mimeType || 'application/pdf',
            data: normalized,
          });
          setResumeUploadedAt(Date.now());
          const content = await extractTextFromPdfBinary(binary);
          if (content) {
            setResumeText(content);
            setResumeStatus(
              `Extracted text from PDF (${content.split('\n').length} lines).`
            );
          } else {
            setResumeText('');
            setResumeStatus(
              'PDF uploaded. AI will parse the attachment directly.'
            );
          }
          return;
        } catch (error) {
          setResumeText('');
          setResumeStatus('PDF uploaded. AI will parse the attachment directly.');
          return;
        }
      }

      if (
        extension === 'docx' ||
        mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        try {
          const base64 = await readAssetBase64(asset);
          const normalized = normalizeBase64(base64);
          if (!normalized) {
            setResumeStatus('Could not read DOCX data for AI parsing.');
            return;
          }
          const binary = await readAssetBinary(asset);
          if (!binary?.length) {
            setResumeStatus('Could not read DOCX data. Paste resume text.');
            return;
          }
          setResumeFilePayload({
            name,
            mimeType:
              mimeType ||
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            data: normalized,
          });
          setResumeUploadedAt(Date.now());
          const content = await extractTextFromDocxBinary(binary);
          if (content) {
            setResumeText(content);
            setResumeStatus(
              `Extracted text from DOCX (${content.split('\n').length} lines).`
            );
          } else {
            setResumeText('');
            setResumeStatus(
              'DOCX uploaded. AI will parse the attachment directly.'
            );
          }
          return;
        } catch (error) {
          setResumeText('');
          setResumeStatus('DOCX uploaded. AI will parse the attachment directly.');
          return;
        }
      }

      if (extension === 'doc' || mimeType === 'application/msword') {
        try {
          const base64 = await readAssetBase64(asset);
          const normalized = normalizeBase64(base64);
          if (!normalized) {
            setResumeStatus('Could not read DOC data for AI parsing.');
            return;
          }
          const binary = await readAssetBinary(asset);
          if (!binary?.length) {
            setResumeStatus('Could not read DOC data. Paste resume text.');
            return;
          }
          setResumeFilePayload({
            name,
            mimeType: mimeType || 'application/msword',
            data: normalized,
          });
          setResumeUploadedAt(Date.now());
          const content = await extractTextFromDocBinary(binary);
          if (content) {
            setResumeText(content);
            setResumeStatus(
              'Extracted best-effort text from DOC. Review and paste if needed.'
            );
          } else {
            setResumeText('');
            setResumeStatus(
              'DOC uploaded. AI will parse the attachment directly.'
            );
          }
          return;
        } catch (error) {
          setResumeText('');
          setResumeStatus('DOC uploaded. AI will parse the attachment directly.');
          return;
        }
      }

      if (!isPlainText) {
        setResumeStatus(
          'Unsupported format. Upload PDF, DOCX, DOC, or paste resume text.'
        );
        return;
      }

      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const base64 = await readAssetBase64(asset);
      const normalized = normalizeBase64(base64);
      if (!normalized) {
        setResumeStatus('Could not read file data for AI parsing.');
        return;
      }
      setResumeFilePayload({
        name,
        mimeType: mimeType || 'text/plain',
        data: normalized,
      });
      setResumeUploadedAt(Date.now());
      setResumeText(content);
      setResumeStatus(`Loaded ${content.split('\n').length} lines.`);
    } catch (error) {
      setResumeStatus('Could not load the resume file.');
    }
  };

  useEffect(() => {
    if (!autoParseEnabled) return;
    const text = resumeText.trim();
    const hasText = text.length >= 80;
    const hasFile = !!resumeFilePayload?.data;
    if (aiParserMode === 'openai') {
      if (!hasText && !hasFile) return;
      if (!aiApiKey.trim()) return;
    } else {
      if (!hasText && !hasFile) return;
      if (!aiBaseUrl.trim()) return;
    }
    const autoKey = text || resumeFilePayload?.name || '';
    if (autoKey && autoKey === lastAutoParsed) return;
    const timer = setTimeout(() => {
      handleAiResumeParse(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [
    resumeText,
    resumeFilePayload,
    autoParseEnabled,
    aiBaseUrl,
    aiModel,
    aiApiKey,
    aiParserMode,
    lastAutoParsed,
  ]);

  useEffect(() => {
    const resumeReady = !!resumeText.trim() || resumeSkills.length > 0;
    if (!resumeReady) return;
    if (aiParserMode !== 'openai' || !aiApiKey.trim()) return;
    if (aiReportLoading) return;
    const reportKey = buildReportKey();
    if (reportKey === lastAiReportKey) return;
    const timer = setTimeout(() => {
      handleAiReportGenerate(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [
    resumeText,
    resumeSkills,
    aiApiKey,
    aiBaseUrl,
    aiModel,
    aiParserMode,
    aiReportLoading,
    lastAiReportKey,
    resumeFilePayload,
    resumeUploadedAt,
  ]);

  const handleAiResumeParse = async (isAuto = false) => {
    if (aiParserMode === 'openai' && !resumeText.trim() && !resumeFilePayload?.data) {
      if (!isAuto) {
        setAiStatus('Add resume text before running the AI parser.');
      }
      return;
    }
    if (aiParserMode === 'serverless' && !aiBaseUrl.trim()) {
      if (!isAuto) {
        setAiStatus('Add the AI parser URL before running.');
      }
      return;
    }
    if (
      aiParserMode === 'serverless' &&
      isHttpsContext() &&
      aiBaseUrl.startsWith('http://') &&
      !isLocalUrl(aiBaseUrl)
    ) {
      if (!isAuto) {
        setAiStatus(
          'AI parser URL must be https when the app is served over https.'
        );
      }
      return;
    }
    if (aiParserMode === 'openai' && !aiApiKey.trim()) {
      if (!isAuto) {
        setAiStatus('Add your OpenAI API key before running.');
      }
      return;
    }

    if (!isAuto) {
      setAiStatus(
        aiParserMode === 'openai'
          ? 'Parsing resume with OpenAI...'
          : 'Parsing resume with serverless AI...'
      );
    }
    try {
      const extraction =
        aiParserMode === 'openai'
          ? await parseResumeWithOpenAI({
              apiKey: aiApiKey.trim(),
              model: aiModel.trim() || 'gpt-4o',
              baseUrl: aiBaseUrl.trim() || 'https://api.openai.com',
              resumeText,
              file: resumeFilePayload || undefined,
            })
          : await parseResumeWithServerless({
              model: aiModel.trim() || 'gpt-4o',
              baseUrl: aiBaseUrl.trim(),
              resumeText,
              file: resumeFilePayload || undefined,
            });
      setAiResumeExtraction(extraction);
      setUseAiParser(true);
      setLastAutoParsed(resumeText.trim() || resumeFilePayload?.name || '');
      if (!isAuto) {
        setAiStatus('AI parsing complete. Review extracted data.');
      }
    } catch (error) {
      if (!isAuto) {
        const message =
          error instanceof Error ? error.message : 'AI parsing failed. Try again.';
        if (message.includes('Failed to fetch')) {
          setAiStatus(
            'AI parsing failed: Failed to fetch. Check the AI parser URL, HTTPS, and CORS.'
          );
        } else {
          setAiStatus(`AI parsing failed: ${message}`);
        }
      }
    }
  };

  const handleAiReportGenerate = async (isAuto = false) => {
    if (aiReportLoading) return;
    const reportKey = buildReportKey();
    const resumeReady = !!resumeText.trim() || resumeSkills.length > 0;
    if (aiParserMode !== 'openai') {
      if (!isAuto) {
        setAiReportStatus('AI analysis requires OpenAI mode. Switch to OpenAI API key.');
      }
      return;
    }
    if (!aiApiKey.trim()) {
      if (!isAuto) {
        setAiReportStatus('Add your OpenAI API key to run AI analysis.');
      }
      return;
    }
    if (!resumeReady) {
      if (!isAuto) {
        setAiReportStatus('Upload a resume to generate AI analysis.');
      }
      return;
    }
    if (isAuto && reportKey === lastAiReportKey) return;

    setAiReportStatus('Running AI analysis agents...');
    setAiReportLoading(true);
    setAnalysisCompletedAgents([]);
    try {
      const analysis = await parseCipherReportWithOpenAI({
        apiKey: aiApiKey.trim(),
        model: aiModel.trim() || 'gpt-4o',
        baseUrl: aiBaseUrl.trim() || 'https://api.openai.com',
        profile: mergedProfile,
        resumeText,
        skills: resumeSkills,
        connections,
        onProgress: ({ agent, completedAgents, totalAgents, report, done }) => {
          setAiReport(report);
          if (agent) {
            setAnalysisCompletedAgents((prev) =>
              prev.includes(agent) ? prev : [...prev, agent]
            );
          }
          if (done) {
            setAiReportStatus('AI analysis ready.');
                    return;
          }
          setAiReportStatus(
            `Running AI analysis agents... (${completedAgents}/${totalAgents} complete)`
          );
        },
      });
      setAiReport(analysis);
      setAiReportUpdatedAt(Date.now());
      setLastAiReportKey(reportKey);
      setAiReportStatus('AI analysis ready.');
    } catch (error) {
      if (!isAuto) {
        setAiReportStatus(
          error instanceof Error ? error.message : 'AI analysis failed. Try again.'
        );
      }
    } finally {
      setAiReportLoading(false);
    }
  };

  const buildAgentContext = () => {
    const trimmedResume = resumeText.trim();
    const truncatedResume =
      trimmedResume.length > 6000
        ? `${trimmedResume.slice(0, 6000)}
...[truncated]`
        : trimmedResume;
    const parsedResumeProfile = {
      currentRole: mergedProfile.currentRole || 'Unknown',
      yearsExperience: mergedProfile.yearsExperience || 'Unknown',
      education: mergedProfile.education || 'Unknown',
      certifications: mergedProfile.certifications || 'Unknown',
      location: mergedProfile.location || 'Unknown',
      industries: mergedProfile.industries || 'Unknown',
    };
    const parsedResumeSkills = resumeSkills.map((skill) => ({
      name: skill.name,
      category: skill.category,
      years: skill.years,
      evidence: skill.evidence,
    }));

    return [
      `Parsed resume profile: ${JSON.stringify(parsedResumeProfile, null, 2)}`,
      `Profile (merged): ${JSON.stringify(mergedProfile, null, 2)}`,
      `Resume text: ${truncatedResume || 'Not available'}`,
      `Parsed resume skills: ${JSON.stringify(parsedResumeSkills, null, 2)}`,
      `LinkedIn connections: ${connections.length}`,
      'Instruction: Use the parsed resume profile and skills above as source-of-truth context for analysis and responses across all sections.',
    ].join('\n');
  };

  const agentCatalog = [
    {
      id: 'market',
      name: 'Sentinel',
      role: 'Geographic competitiveness intelligence analyst',
      keywords: [
        /market/i,
        /hiring/i,
        /layoff/i,
        /economy|economic/i,
        /salary|compensation|wage/i,
        /trend|outlook|inflation/i,
      ],
      prompt:
        'Assess candidate competitiveness across international, national, regional, and local markets. Use a structured market-analysis format that includes: Global Market Overview, Candidate Competitiveness (strengths + opportunities), In-Demand Skills, Regional Competitiveness, and a concise Conclusion. Identify strongest locations and industries, quantify hiring momentum when possible, map in-demand hard/soft skills, call out standout strengths, and use recent, source-cited data.',
    },
    {
      id: 'skills',
      name: 'Aegis',
      role: 'Skills and AI impact strategist',
      keywords: [/skill/i, /upskill|reskill/i, /portfolio|competenc/i, /ai risk/i],
      prompt: 'Focus on skills gaps, prioritization, and AI impact.',
    },
    {
      id: 'career',
      name: 'Atlas',
      role: 'Career path strategist',
      keywords: [/career/i, /path|role|pivot|transition/i, /promotion|growth/i],
      prompt: 'Focus on realistic career paths and transition steps.',
    },
    {
      id: 'network',
      name: 'Nexus',
      role: 'Networking strategist',
      keywords: [/network/i, /linkedin/i, /referral/i, /recruiter|hiring manager/i],
      prompt: 'Focus on networking strategy and outreach tactics.',
    },
    {
      id: 'ats',
      name: 'Helix',
      role: 'Resume and ATS analyst',
      keywords: [/resume/i, /ats/i, /cv/i, /application/i],
      prompt: 'Focus on ATS readiness and resume optimization.',
    },
  ];

  const sourceNote =
    'Use public, reliable sources and cite URLs when referencing market, salary, or industry data. For Sentinel responses, prioritize a clear sectioned market brief with concrete metrics and competitiveness context.';

  const runChatAgent = async ({
    name,
    role,
    prompt,
    question,
  }: {
    name: string;
    role: string;
    prompt: string;
    question: string;
  }) => {
    const response = await fetch(`${aiBaseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiApiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel.trim() || 'gpt-4o',
        temperature: 0.35,
        messages: [
          {
            role: 'system',
            content: `You are ${name}, a ${role}. ${prompt} ${sourceNote}`,
          },
          {
            role: 'user',
            content: `Context:\n${buildAgentContext()}\n\nQuestion:\n${question}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent ${name} failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (!reply) {
      throw new Error(`Agent ${name} returned empty response.`);
    }
    return reply;
  };

  const buildOnDemandAgent = (question: string) => {
    const short = question.split(/\s+/).slice(0, 4).join(' ');
    return {
      id: 'on-demand',
      name: 'Nova',
      role: `On-demand specialist for: ${short || 'the request'}`,
      prompt:
        'Answer the question directly and note any assumptions or missing inputs.',
    };
  };

  const selectAgentsForQuestion = (question: string, forcedAgents: string[] = []) => {
    const matches = agentCatalog.filter((agent) =>
      agent.keywords.some((pattern) => pattern.test(question))
    );
    const forced = agentCatalog.filter((agent) => forcedAgents.includes(agent.id));
    const combined = [...matches, ...forced].filter(
      (agent, index, list) => list.findIndex((item) => item.id === agent.id) === index
    );
    if (matches.length === 0) {
      return forced.length ? [...forced, buildOnDemandAgent(question)] : [buildOnDemandAgent(question)];
    }
    return combined;
  };

  const runAgentOrchestration = async (question: string, forcedAgents: string[] = []) => {
    const agents = selectAgentsForQuestion(question, forcedAgents);
    const results = await Promise.allSettled(
      agents.map((agent) =>
        runChatAgent({
          name: agent.name,
          role: agent.role,
          prompt: agent.prompt,
          question,
        })
      )
    );

    const agentReplies = results.map((result, index) => ({
      agent: agents[index],
      response:
        result.status === 'fulfilled'
          ? result.value
          : `Unable to respond: ${result.reason instanceof Error ? result.reason.message : 'Error'}`,
    }));

    const successfulReplies = agentReplies.filter(
      (reply) => !reply.response.startsWith('Unable to respond')
    );
    if (!successfulReplies.length) {
      throw new Error('All agents failed to respond. Try again.');
    }

    const synthesis = await runChatAgent({
      name: 'Cipher',
      role: 'Orchestrator',
      prompt:
        'Coordinate with other agents. Combine their inputs into a single, concise answer. ' +
        'If an agent is missing data, call it out and ask one clarifying question.',
      question: `Agent responses:\n${successfulReplies
        .map((reply) => `${reply.agent.name}: ${reply.response}`)
        .join('\n\n')}\n\nUser question: ${question}`,
    });

    return { agentReplies, synthesis };
  };

  const handleCardChat = async ({
    question,
    setStatus,
    setThread,
    setQuestion,
    thread,
    forcedAgents,
  }: {
    question: string;
    setStatus: (value: string) => void;
    setThread: React.Dispatch<
      React.SetStateAction<Array<{ role: 'user' | 'assistant'; content: string }>>
    >;
    setQuestion: (value: string) => void;
    thread: Array<{ role: 'user' | 'assistant'; content: string }>;
    forcedAgents?: string[];
  }) => {
    if (!question.trim()) {
      setStatus('Add a question before sending.');
      return;
    }
    if (aiParserMode !== 'openai') {
      setStatus('Agent chat requires OpenAI mode. Switch to OpenAI API key.');
      return;
    }
    if (!aiApiKey.trim()) {
      setStatus('Add your OpenAI API key to enable agent chat.');
      return;
    }

    const nextThread = [...thread, { role: 'user', content: question.trim() }].slice(-10);
    setThread(nextThread);
    setQuestion('');
    setStatus('Coordinating agents...');

    try {
      const orchestrationAgents =
        forcedAgents && forcedAgents.length
          ? forcedAgents
          : [];
      const { synthesis } = await runAgentOrchestration(
        question.trim(),
        orchestrationAgents
      );
      setThread([...nextThread, { role: 'assistant', content: `Cipher: ${synthesis}` }]);
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Agent chat failed. Try again.');
    }
  };

  const handleAgentChat = async () => {
    await handleCardChat({
      question: agentQuestion,
      setStatus: setAgentChatStatus,
      setThread: setAgentThread,
      setQuestion: setAgentQuestion,
      thread: agentThread,
    });
  };

  const handleMarketAgentChat = async () => {
    await handleCardChat({
      question: marketQuestion,
      setStatus: setMarketChatStatus,
      setThread: setMarketThread,
      setQuestion: setMarketQuestion,
      thread: marketThread,
      forcedAgents: ['market'],
    });
  };

  const handleSkillsAgentChat = async () => {
    await handleCardChat({
      question: skillsQuestion,
      setStatus: setSkillsChatStatus,
      setThread: setSkillsThread,
      setQuestion: setSkillsQuestion,
      thread: skillsThread,
      forcedAgents: ['skills'],
    });
  };

  const handleCareerAgentChat = async () => {
    await handleCardChat({
      question: careerQuestion,
      setStatus: setCareerChatStatus,
      setThread: setCareerThread,
      setQuestion: setCareerQuestion,
      thread: careerThread,
      forcedAgents: ['career'],
    });
  };

  const handleAtsAgentChat = async () => {
    await handleCardChat({
      question: atsQuestion,
      setStatus: setAtsChatStatus,
      setThread: setAtsThread,
      setQuestion: setAtsQuestion,
      thread: atsThread,
      forcedAgents: ['ats'],
    });
  };

  const handleNetworkAgentChat = async () => {
    await handleCardChat({
      question: networkQuestion,
      setStatus: setNetworkChatStatus,
      setThread: setNetworkThread,
      setQuestion: setNetworkQuestion,
      thread: networkThread,
      forcedAgents: ['network'],
    });
  };

  const handleResumeAgentChat = async () => {
    await handleCardChat({
      question: resumeQuestion,
      setStatus: setResumeChatStatus,
      setThread: setResumeThread,
      setQuestion: setResumeQuestion,
      thread: resumeThread,
      forcedAgents: ['ats'],
    });
  };

  const agentRoster = [
    {
      name: 'Cipher',
      role: 'Career strategist',
      status: hasAiReport ? 'Synced' : 'Waiting for AI analysis',
    },
    {
      name: 'Sentinel',
      role: 'Competitiveness by geography',
      status: hasAiReport ? 'Synced' : 'Waiting for AI analysis',
    },
    {
      name: 'Aegis',
      role: 'Skills & AI impact',
      status: hasAiReport ? 'Ready' : 'Waiting for AI analysis',
    },
    {
      name: 'Atlas',
      role: 'Career paths',
      status: hasAiReport ? 'Ready' : 'Waiting for AI analysis',
    },
    {
      name: 'Nexus',
      role: 'Network analysis',
      status: connections.length ? 'Synced' : 'Waiting for LinkedIn data',
    },
  ];

  useEffect(() => {
    if (activeCareerPlanIndex >= report.careerPaths.length) {
      setActiveCareerPlanIndex(0);
    }
  }, [activeCareerPlanIndex, report.careerPaths.length]);

  const renderChatSection = ({
    title,
    question,
    setQuestion,
    onSend,
    status,
    thread,
    buttonLabel,
    placeholder,
  }: {
    title: string;
    question: string;
    setQuestion: (value: string) => void;
    onSend: () => void;
    status: string;
    thread: Array<{ role: 'user' | 'assistant'; content: string }>;
    buttonLabel: string;
    placeholder: string;
  }) => (
    <View style={styles.chatSection}>
      <Text style={styles.reportSubheading}>{title}</Text>
      <Field
        label={title}
        value={question}
        onChangeText={setQuestion}
        placeholder={placeholder}
        multiline
      />
      <Pressable style={styles.primaryButton} onPress={onSend}>
        <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      </Pressable>
      {status ? <Text style={styles.helper}>{status}</Text> : null}
      {thread.length ? (
        thread.map((message, index) => (
          <View key={`${message.role}-${index}`} style={styles.chatBubble}>
            <Text style={styles.chatRole}>
              {message.role === 'user'
                ? 'You'
                : message.content.split(':')[0] || 'Agent'}
            </Text>
            <Text style={styles.chatText}>
              {message.role === 'user'
                ? message.content
                : message.content.split(':').slice(1).join(':').trim() || message.content}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.helper}>No agent responses yet.</Text>
      )}
    </View>
  );

  const latestMarketInsight = [...marketThread]
    .reverse()
    .find((message) => message.role === 'assistant')?.content;
  const latestMarketInsightText = latestMarketInsight
    ? latestMarketInsight.split(':').slice(1).join(':').trim() || latestMarketInsight
    : '';

  const renderActiveCard = () => {
    if (activeCard === 'home') {
      return (
        <Card
          title="Main Screen"
          subtitle="Upload your resume and LinkedIn file to unlock the AI analysis cards."
        >
          <View style={styles.cardRow}>
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>Resume Upload</Text>
              <Text style={styles.helper}>
                Supports PDF, DOCX, DOC, or plain text.
              </Text>
              <Pressable style={styles.secondaryButton} onPress={handleResumePick}>
                <Text style={styles.secondaryButtonText}>
                  {Platform.OS === 'web' ? 'Upload resume (web)' : 'Pick resume file'}
                </Text>
              </Pressable>
              {resumeFileName ? (
                <Text style={styles.helper}>Selected file: {resumeFileName}</Text>
              ) : null}
              {resumeUploadedAt ? (
                <Text style={styles.helper}>
                  File expires on {formatExpiryDate(resumeUploadedAt)}.
                </Text>
              ) : null}
              {resumeStatus ? <Text style={styles.helper}>{resumeStatus}</Text> : null}
            </View>
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>LinkedIn Upload</Text>
              <Text style={styles.helper}>Upload any LinkedIn export format.</Text>
              <Pressable style={styles.secondaryButton} onPress={handleLinkedInPick}>
                <Text style={styles.secondaryButtonText}>
                  {Platform.OS === 'web' ? 'Upload LinkedIn file' : 'Pick LinkedIn file'}
                </Text>
              </Pressable>
              {linkedInStatus ? <Text style={styles.helper}>{linkedInStatus}</Text> : null}
              {linkedInUploadedAt ? (
                <Text style={styles.helper}>
                  File expires on {formatExpiryDate(linkedInUploadedAt)}.
                </Text>
              ) : null}
              {linkedInAiStatus ? (
                <Text style={styles.helper}>{linkedInAiStatus}</Text>
              ) : null}
              {connections.length ? (
                <Text style={styles.helper}>
                  Parsed {connections.length} connections.
                </Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.label}>AI analysis</Text>
          <Pressable style={styles.primaryButton} onPress={() => handleAiReportGenerate(false)}>
            <Text style={styles.primaryButtonText}>
              {aiReportLoading ? 'Running AI analysis...' : 'Run AI analysis'}
            </Text>
          </Pressable>
          {aiReportUpdatedAt ? (
            <Text style={styles.helper}>
              Last updated {formatTimestamp(aiReportUpdatedAt)}.
            </Text>
          ) : null}
          {aiReportStatus ? <Text style={styles.helper}>{aiReportStatus}</Text> : null}

          <Text style={styles.label}>Status snapshot</Text>
          <View style={styles.dashboardGrid}>
            <DashboardCard
              label="Resume"
              value={resumeFileName ? 'Uploaded' : 'Missing'}
              meta={resumeFileName || 'Upload resume to begin'}
            />
            <DashboardCard
              label="AI Analysis"
              value={hasAiReport ? 'Generated' : 'Not run'}
              meta={
                aiReportUpdatedAt
                  ? `Updated ${formatTimestamp(aiReportUpdatedAt)}`
                  : aiReportStatus || 'Run AI analysis'
              }
            />
            <DashboardCard
              label="LinkedIn"
              value={connections.length ? `${connections.length} connections` : 'Not parsed'}
              meta={linkedInAiStatus || linkedInStatus || 'Upload connections file'}
            />
            <DashboardCard
              label="Location"
              value={mergedProfile.location || 'Location needed'}
              meta={
                hasAiReport
                  ? report.marketSnapshot.summary || 'AI market snapshot ready'
                  : 'Run AI analysis'
              }
            />
          </View>

          <Text style={styles.label}>KPI tiles</Text>
          <View style={styles.dashboardGrid}>
            <KpiTile
              label="ATS Score"
              value={
                report.resumeAnalysis?.atsScore !== undefined
                  ? `${report.resumeAnalysis.atsScore}`
                  : 'N/A'
              }
              meta={
                report.resumeAnalysis?.atsReadiness ||
                (hasAiReport ? 'ATS data missing' : 'Run AI analysis')
              }
            />
            <KpiTile label="AI Risk" value={aiRiskLabel} meta="From skills portfolio" />
            <KpiTile label="Market Signals" value={marketSignal} meta="AI analysis" />
          </View>

          {missingFields.length ? (
            <>
              <Text style={styles.label}>Missing inputs</Text>
              {missingFields.map((field) => (
                <Text key={field} style={styles.missingText}>
                  - {field}
                </Text>
              ))}
            </>
          ) : null}

          <Text style={styles.label}>Agent lineup</Text>
          <View style={styles.agentGrid}>
            {agentRoster.map((agent) => (
              <View key={agent.name} style={styles.agentCard}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentRole}>{agent.role}</Text>
                <Text style={styles.agentStatus}>{agent.status}</Text>
              </View>
            ))}
          </View>

          {renderChatSection({
            title: 'Ask Cipher',
            question: agentQuestion,
            setQuestion: setAgentQuestion,
            onSend: handleAgentChat,
            status: agentChatStatus,
            thread: agentThread,
            buttonLabel: 'Ask Cipher',
            placeholder: 'Ask for career moves, negotiation prep, or strategy.',
          })}
        </Card>
      );
    }

    if (activeCard === 'resume') {
      return (
        <Card
          title="Resume Upload & Profile"
          subtitle="Upload, parse, and confirm your resume data."
        >
          <CollapsibleCard title="Resume Upload" defaultCollapsed={false}>
            <Text style={styles.helper}>
              Supports PDF, DOCX, DOC, or plain text. Cipher uses your resume to
              populate role, experience, education, and skills.
            </Text>
            <Text style={styles.helper}>
              ATS scan runs on text extracted from the uploaded file.
            </Text>
            <Text style={styles.helper}>
              PDF extraction is best-effort for text-based PDFs. If results look off, upload
              a text-based PDF or DOCX.
            </Text>
            <Pressable style={styles.secondaryButton} onPress={handleResumePick}>
              <Text style={styles.secondaryButtonText}>
                {Platform.OS === 'web' ? 'Upload resume (web)' : 'Pick resume file'}
              </Text>
            </Pressable>
            {resumeFileName ? (
              <Text style={styles.helper}>Selected file: {resumeFileName}</Text>
            ) : null}
            {resumeUploadedAt ? (
              <Text style={styles.helper}>
                File expires on {formatExpiryDate(resumeUploadedAt)}.
              </Text>
            ) : null}
            {resumeStatus ? <Text style={styles.helper}>{resumeStatus}</Text> : null}
            {resumeExtraction.warnings.length && resumeText.trim() ? (
              resumeExtraction.warnings.map((warning) => (
                <Text key={warning} style={styles.missingText}>
                  - {warning}
                </Text>
              ))
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard title="AI Resume Parser (Recommended)" defaultCollapsed={false}>
            <Text style={styles.helper}>
              Choose how to parse: direct OpenAI (client key) or serverless endpoint.
            </Text>
            <View style={styles.optionRow}>
              <Chip
                label="OpenAI API key"
                selected={aiParserMode === 'openai'}
                onPress={() => setAiParserMode('openai')}
              />
              <Chip
                label="Serverless URL"
                selected={aiParserMode === 'serverless'}
                onPress={() => setAiParserMode('serverless')}
              />
            </View>
            {aiParserMode === 'openai' ? (
              <Field
                label="OpenAI API key"
                value={aiApiKey}
                onChangeText={setAiApiKey}
                placeholder="sk-..."
                secureTextEntry
              />
            ) : (
              <Text style={styles.helper}>
                Deploy the serverless parser and paste its URL here.
              </Text>
            )}
            <Field
              label="Model"
              value={aiModel}
              onChangeText={setAiModel}
              placeholder="gpt-4o"
            />
            <Field
              label={aiParserMode === 'openai' ? 'OpenAI base URL' : 'AI parser URL'}
              value={aiBaseUrl}
              onChangeText={setAiBaseUrl}
              placeholder={
                aiParserMode === 'openai'
                  ? 'https://api.openai.com'
                  : 'https://your-parser.example.com'
              }
            />
            <Text style={styles.helper}>
              Tip: If the app is served over https (GitHub Pages), the parser URL must
              be https as well. http URLs will be blocked.
            </Text>
            {aiParserMode === 'openai' ? (
              <Text style={styles.helper}>
                Note: Some browsers block direct API calls due to CORS. If this fails,
                switch to the serverless parser. Only PDFs are sent as attachments;
                other file types use extracted text.
              </Text>
            ) : null}
            <Pressable style={styles.primaryButton} onPress={() => handleAiResumeParse(false)}>
              <Text style={styles.primaryButtonText}>Re-run AI Parser</Text>
            </Pressable>
            {aiStatus ? <Text style={styles.helper}>{aiStatus}</Text> : null}
            {aiResumeExtraction ? (
              <ToggleRow
                label="Use AI parsing results"
                value={useAiParser}
                onValueChange={setUseAiParser}
              />
            ) : null}
            <ToggleRow
              label="Auto-parse on upload"
              value={autoParseEnabled}
              onValueChange={setAutoParseEnabled}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Extracted Profile" defaultCollapsed={false}>
            <InfoRow label="Name" value={mergedProfile.name || 'Not detected'} />
            <InfoRow label="Current role" value={mergedProfile.currentRole || 'Not detected'} />
            <InfoRow
              label="Years of experience"
              value={mergedProfile.yearsExperience || 'Not detected'}
            />
            <InfoRow label="Education" value={mergedProfile.education || 'Not detected'} />
            <InfoRow
              label="Certifications"
              value={mergedProfile.certifications || 'Not detected'}
            />
            <InfoRow label="Industries" value={mergedProfile.industries || 'Not detected'} />
            <InfoRow
              label="Location (from resume)"
              value={resumeExtraction.profile.location || 'Not detected'}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Location and Mobility">
            <Field
              label="Location (confirm or update)"
              value={profile.location || mergedProfile.location || ''}
              onChangeText={(value) => updateProfile('location', value)}
              placeholder="City, region, or time zone"
            />
            <ToggleRow
              label="Willing to relocate"
              value={profile.willingToRelocate}
              onValueChange={(value) => updateProfile('willingToRelocate', value)}
            />
            <ToggleRow
              label="Open to international opportunities"
              value={profile.openToInternational}
              onValueChange={(value) => updateProfile('openToInternational', value)}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Demographics (Required)">
            <Field
              label="Age"
              value={profile.age}
              onChangeText={(value) => updateProfile('age', value)}
              placeholder="e.g., 34"
              keyboardType="numeric"
            />
            <Field
              label="Gender"
              value={profile.gender}
              onChangeText={(value) => updateProfile('gender', value)}
              placeholder="e.g., Woman, Man, Non-binary"
            />
            <Field
              label="Race/Ethnicity"
              value={profile.raceEthnicity}
              onChangeText={(value) => updateProfile('raceEthnicity', value)}
              placeholder="e.g., Black, Hispanic/Latino, Asian"
            />
          </CollapsibleCard>

          <CollapsibleCard title="Goals and Risk Profile">
            <Text style={styles.label}>Career goals</Text>
            <View style={styles.optionRow}>
              {goalOptions.map((goal) => (
                <Chip
                  key={goal}
                  label={goal}
                  selected={profile.careerGoals.includes(goal)}
                  onPress={() => toggleGoal(goal)}
                />
              ))}
            </View>
            <Text style={styles.label}>Risk tolerance</Text>
            <View style={styles.optionRow}>
              {riskOptions.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={profile.riskTolerance === option}
                  onPress={() => updateProfile('riskTolerance', option)}
                />
              ))}
            </View>
            <Text style={styles.label}>AI literacy level</Text>
            <View style={styles.optionRow}>
              {aiOptions.map((option) => (
                <Chip
                  key={option}
                  label={option}
                  selected={profile.aiLiteracy === option}
                  onPress={() => updateProfile('aiLiteracy', option)}
                />
              ))}
            </View>
          </CollapsibleCard>

          {renderChatSection({
            title: 'Ask the resume agent (Helix)',
            question: resumeQuestion,
            setQuestion: setResumeQuestion,
            onSend: handleResumeAgentChat,
            status: resumeChatStatus,
            thread: resumeThread,
            buttonLabel: 'Ask Helix',
            placeholder: 'Ask about ATS readiness or resume improvements.',
          })}
        </Card>
      );
    }

    if (activeCard === 'linkedin') {
      return (
        <Card
          title="LinkedIn Upload"
          subtitle="Upload your LinkedIn export to power network insights."
        >
          <Text style={styles.helper}>
            Download steps: Settings &amp; Privacy {'>'} Data Privacy {'>'} Get a copy of your
            data {'>'} Connections {'>'} Request archive.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={handleLinkedInPick}>
            <Text style={styles.secondaryButtonText}>
              {Platform.OS === 'web' ? 'Upload LinkedIn file' : 'Pick LinkedIn file'}
            </Text>
          </Pressable>
          <Text style={styles.helper}>
            AI agent will parse any file format you upload.
          </Text>
          {aiParserMode === 'openai' && !aiApiKey.trim() ? (
            <Text style={styles.helper}>
              Add your OpenAI API key in the AI Resume Parser section to enable
              LinkedIn AI parsing.
            </Text>
          ) : null}
          {linkedInStatus ? <Text style={styles.helper}>{linkedInStatus}</Text> : null}
          {linkedInUploadedAt ? (
            <Text style={styles.helper}>
              File expires on {formatExpiryDate(linkedInUploadedAt)}.
            </Text>
          ) : null}
          {linkedInAiStatus ? <Text style={styles.helper}>{linkedInAiStatus}</Text> : null}
          <ToggleRow
            label="Enable LinkedIn AI agent"
            value={linkedInAiEnabled}
            onValueChange={setLinkedInAiEnabled}
          />
          {connections.length ? (
            <Text style={styles.helper}>
              Parsed {connections.length} connections from LinkedIn file.
            </Text>
          ) : null}

          {renderChatSection({
            title: 'Ask the network agent (Nexus)',
            question: networkQuestion,
            setQuestion: setNetworkQuestion,
            onSend: handleNetworkAgentChat,
            status: networkChatStatus,
            thread: networkThread,
            buttonLabel: 'Ask Nexus',
            placeholder: 'Ask about networking strategy or outreach tactics.',
          })}
        </Card>
      );
    }

    if (activeCard === 'market') {
      return (
        <Card
          title="Market Conditions"
          subtitle="Sentinel compares your competitiveness across international, national, regional, and local demand signals."
        >
          <CollapsibleCard title="Sentinel competitiveness dashboard" defaultCollapsed={false}>
            {sentinelWaitingOnAegis ? (
              <View style={styles.marketWaitingBanner}>
                <Text style={styles.marketWaitingText}>⏳ Sentinel is waiting on Aegis skills data to finalize competitiveness fit and regional demand alignment.</Text>
              </View>
            ) : null}
            <View style={styles.marketGlobalSynopsisCard}>
              <View style={styles.marketSignalRow}>
                <Text style={styles.marketSignalText}>🌍 Overall market competitiveness</Text>
                <Text style={styles.marketSignalText}>{competitivenessOutlook.score}/100</Text>
              </View>
              <View style={styles.metricBar}>
                <View
                  style={[
                    styles.metricBarFill,
                    {
                      width: `${Math.min(100, competitivenessOutlook.score)}%`,
                      backgroundColor: competitivenessOutlook.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.marketSynopsisText}>{fitSynopsis}</Text>
              <Text style={styles.marketInferenceText}>
                Outlook: <Text style={{ color: competitivenessOutlook.color }}>{competitivenessOutlook.status}</Text> •
                Coverage fit {fitCoveragePct}% • Top standout skills: {fitStandoutDetails.slice(0, 3).map((skill) => skill.name).join(', ') || 'Add skills to detect standouts'}
              </Text>
              <Text style={styles.marketInferenceText}>
                Aegis handoff (high-demand skills + experience): {aegisHandoffDetails
                  .slice(0, 3)
                  .map((skill) => `${skill.name} (${skill.years}y)`)
                  .join(', ') || 'Waiting for Aegis handoff'}
              </Text>
              {fitInferenceNote ? (
                <Text style={styles.marketInferenceText}>🧠 {fitInferenceNote}</Text>
              ) : null}
              <Text style={styles.marketInferenceText}>
                🔗 How these work together: Sentinel computes competitiveness using market demand coverage, while Aegis handoff contributes your strongest high-demand skills and estimated experience context.
              </Text>
            </View>

            <View style={styles.marketScopeGrid}>
              {locationDemandCards.map((scope) => (
                <View key={scope.key} style={styles.marketScopeCard}>
                  <View style={styles.marketSignalRow}>
                    <Text style={styles.marketScopeTitle}>🌐 {scope.label}</Text>
                    <View style={[styles.marketPill, { borderColor: scope.outlookColor }]}>
                      <View style={[styles.marketPillDot, { backgroundColor: scope.outlookColor }]} />
                      <Text style={styles.marketPillText}>{scope.outlookStatus}</Text>
                    </View>
                  </View>
                  <Text style={styles.marketScopeSubtitle}>{scope.subtitle}</Text>
                  <Text style={styles.marketScopeText}>📍 Demand location: {scope.locationLabel}</Text>

                  <View style={styles.marketTrendRow}>
                    <Text style={[styles.marketTrendArrow, { color: scope.trendColor }]}>{scope.trendArrow}</Text>
                    <View>
                      <Text style={styles.marketSignalText}>{scope.trendLabel}</Text>
                      <Text style={styles.marketScopeSubtitle}>
                        Hiring momentum: {scope.hiringDelta >= 0 ? '+' : ''}{scope.hiringDelta}% (recent hiring signal)
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.marketFitLabel}>
                    {scope.key === 'international'
                      ? '🌎 Countries and high-demand industries'
                      : '🏢 High-demand industries'}
                  </Text>
                  <View style={styles.marketChipRow}>
                    {scope.industries.slice(0, 5).map((industry) => (
                      <View key={`${scope.key}-industry-${industry}`} style={styles.marketChip}>
                        <Text style={styles.marketChipText}>{industry}</Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.marketFitLabel}>🛠 In-demand hard + soft skills</Text>
                  <View style={styles.marketChipRow}>
                    {scope.topSkills.length ? (
                      scope.topSkills.map((skill) => (
                        <View key={`${scope.key}-${skill}`} style={styles.marketChip}>
                          <Text style={styles.marketChipText}>{skill}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.helper}>Run AI analysis to identify in-demand skills.</Text>
                    )}
                  </View>

                  <Text style={styles.marketFitLabel}>⭐ Why you stand out in this market</Text>
                  {scope.standoutSkills.length ? (
                    <View style={styles.marketChipRow}>
                      {scope.standoutSkills.map((skill) => (
                        <View key={`${scope.key}-standout-${skill}`} style={styles.marketChipStrong}>
                          <Text style={styles.marketChipText}>{skill}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.helper}>
                      Add quantified project outcomes and certifications to increase standout signals.
                    </Text>
                  )}

                  <View style={styles.marketGapBanner}>
                    <Text style={styles.marketGapTitle}>🎯 Competitiveness fit</Text>
                    <Text style={styles.marketGapText}>{scope.fitLevel} for this geography.</Text>
                    {gapDemandSkills.length ? (
                      <Text style={styles.marketGapText}>
                        Priority gaps: {gapDemandSkills.slice(0, 3).map((skill) => skill.name).join(', ')}
                      </Text>
                    ) : (
                      <Text style={styles.marketGapText}>
                        Strong match with active demand. Keep adding recent, measurable achievements.
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {missingResumeSignals.length ? (
              <Text style={styles.marketInferenceText}>
                📝 Missing resume details reducing precision: {missingResumeSignals.join(', ')}
              </Text>
            ) : null}
          </CollapsibleCard>
          <CollapsibleCard title="Explore demand opportunities">
            <View style={styles.marketExploreCard}>
              <Text style={styles.marketExploreText}>
                Use the Skills Analysis page to explore how to build missing skills and
                prioritize the sectors above. We’ll map learning resources, projects, and
                milestones to close your gaps.
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={() => setActiveCard('skills')}
              >
                <Text style={styles.primaryButtonText}>Explore skills plan</Text>
              </Pressable>
            </View>
          </CollapsibleCard>
          {latestMarketInsightText ? (
            <CollapsibleCard title="Latest Sentinel market analysis" defaultCollapsed={false}>
              <Text style={styles.chatText}>{latestMarketInsightText}</Text>
            </CollapsibleCard>
          ) : null}
          <CollapsibleCard title={report.marketSnapshot.title} defaultCollapsed={false}>
            <GraphicSectionBody section={report.marketSnapshot} highlightMarket />
            {!hasAiReport ? (
              <Text style={styles.helper}>
                Run AI analysis to generate market conditions and citations.
              </Text>
            ) : null}
          </CollapsibleCard>
          <CollapsibleCard title={report.marketOutlook.title}>
            <GraphicSectionBody section={report.marketOutlook} highlightMarket />
            {report.internationalPlan ? (
              <Text style={styles.helper}>
                International opportunities are summarized in the International Opportunities section
                below.
              </Text>
            ) : null}
          </CollapsibleCard>
          <CollapsibleCard title={report.geographicOptions.title}>
            <GraphicSectionBody section={report.geographicOptions} />
          </CollapsibleCard>
          {report.internationalPlan ? (
            <CollapsibleCard
              title="International Opportunities"
              defaultCollapsed={!profile.openToInternational}
            >
              <GraphicSectionBody section={report.internationalPlan} />
            </CollapsibleCard>
          ) : null}

          {renderChatSection({
            title: 'Ask the market agent (Sentinel)',
            question: marketQuestion,
            setQuestion: setMarketQuestion,
            onSend: handleMarketAgentChat,
            status: marketChatStatus,
            thread: marketThread,
            buttonLabel: 'Ask Sentinel',
            placeholder: 'Ask where demand is strongest, which industries are hiring, and why you stand out.',
          })}
        </Card>
      );
    }

    if (activeCard === 'skills') {
      return (
        <Card title="Skills Analysis" subtitle="Skill value, AI impact, and growth strategy.">
          <CollapsibleCard title={report.aiResilience.title} defaultCollapsed={false}>
            <GraphicSectionBody section={report.aiResilience} />
          </CollapsibleCard>
          <CollapsibleCard title="Top valuable skills" defaultCollapsed={false}>
            {topValuableSkills.length ? (
              topValuableSkills.map((skill) => (
                <View key={skill.name} style={styles.skillHighlightCard}>
                  <View style={styles.skillHighlightHeader}>
                    <Text style={styles.skillName}>{skill.name}</Text>
                    <Text style={styles.skillMeta}>{skill.category}</Text>
                  </View>
                  <View style={styles.skillHighlightRow}>
                    <Text style={styles.skillHighlightLabel}>Market value</Text>
                    <Text style={styles.skillHighlightValue}>
                      {skill.marketValueScore}
                    </Text>
                  </View>
                  <View style={styles.metricBar}>
                    <View
                      style={[
                        styles.metricBarFill,
                        {
                          width: `${Math.min(100, skill.marketValueScore)}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.skillTagRow}>
                    <View style={styles.skillTag}>
                      <Text style={styles.skillTagText}>
                        Demand: {skill.demandLevel}
                      </Text>
                    </View>
                    <View style={styles.skillTag}>
                      <Text style={styles.skillTagText}>
                        Scarcity: {skill.scarcity}
                      </Text>
                    </View>
                    <View style={styles.skillTag}>
                      <Text style={styles.skillTagText}>
                        Premium: {skill.compensationPremium}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.helper}>
                Run AI analysis to generate the top valuable skills list.
              </Text>
            )}
          </CollapsibleCard>
          <CollapsibleCard title="Skills Portfolio" defaultCollapsed={false}>
            {report.skillsPortfolio.length ? (
              report.skillsPortfolio.map((skill) => (
                <SkillReportCard
                  key={skill.name}
                  skill={skill}
                  riskTone={getRiskTone(skill.aiRisk)}
                />
              ))
            ) : (
              <Text style={styles.helper}>
                Run AI analysis to generate the skills portfolio and citations.
              </Text>
            )}
          </CollapsibleCard>
          <CollapsibleCard title={report.skillsGapResources.title}>
            <GraphicSectionBody section={report.skillsGapResources} />
          </CollapsibleCard>
          <CollapsibleCard title={report.learningRoadmap.title}>
            <GraphicSectionBody section={report.learningRoadmap} />
          </CollapsibleCard>
          <CollapsibleCard title={report.competencyMilestones.title}>
            <GraphicSectionBody section={report.competencyMilestones} />
          </CollapsibleCard>
          <CollapsibleCard title={report.projectsToPursue.title}>
            <GraphicSectionBody section={report.projectsToPursue} />
          </CollapsibleCard>

          {renderChatSection({
            title: 'Ask the skills agent (Aegis)',
            question: skillsQuestion,
            setQuestion: setSkillsQuestion,
            onSend: handleSkillsAgentChat,
            status: skillsChatStatus,
            thread: skillsThread,
            buttonLabel: 'Ask Aegis',
            placeholder: 'Ask about skills to prioritize or de-risk.',
          })}
        </Card>
      );
    }

    if (activeCard === 'career') {
      const selectedPlan = report.careerPaths[activeCareerPlanIndex];
      return (
        <Card title="Career Paths" subtitle="Traditional, alternate, and moonshot plans.">
          <CollapsibleCard title={report.aiForward.title} defaultCollapsed={false}>
            <ReportSectionBody section={report.aiForward} showSignal />
          </CollapsibleCard>
          <CollapsibleCard title={report.careerInsights.title}>
            <ReportSectionBody section={report.careerInsights} showSignal />
          </CollapsibleCard>
          <CollapsibleCard title="Career Path Options" defaultCollapsed={false}>
            {report.careerPaths.map((path, index) => (
              <View key={path.tier} style={styles.reportCard}>
                <Text style={styles.reportTitle}>{path.tier}</Text>
                <Text style={styles.reportText}>{path.title}</Text>
                <Text style={styles.reportText}>{path.overview}</Text>
                <Text style={styles.reportMeta}>
                  Path type: {path.pathType} ({path.feasibility})
                </Text>
                <Text style={styles.reportText}>Risk/reward: {path.riskReward}</Text>
                <Text style={styles.reportText}>
                  Earning potential: {path.earningPotential}
                </Text>
                <Text style={styles.reportText}>AI resilience: {path.aiResilience}</Text>
                {path.positions.length ? (
                  <>
                    <Text style={styles.reportSubheading}>Suggested positions</Text>
                    {path.positions.map((position) => (
                      <View key={position.title} style={styles.positionCard}>
                        <Text style={styles.reportText}>{position.title}</Text>
                        <Text style={styles.reportMeta}>{position.fit}</Text>
                        <Pressable
                          style={styles.linkButton}
                          onPress={() => setActiveCareerPlanIndex(index)}
                        >
                          <Text style={styles.linkButtonText}>View detailed plan</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ))}
            {!report.careerPaths.length ? (
              <Text style={styles.helper}>
                Run AI analysis to generate career path options.
              </Text>
            ) : null}
          </CollapsibleCard>

          <CollapsibleCard title="Career Path Plan" defaultCollapsed={false}>
            {selectedPlan ? (
              <View style={styles.reportCard}>
                <Text style={styles.reportTitle}>{selectedPlan.title}</Text>
                <Text style={styles.reportMeta}>
                  {selectedPlan.pathType} plan ({selectedPlan.feasibility})
                </Text>
                {selectedPlan.demographicNotes.length ? (
                  <>
                    <Text style={styles.reportSubheading}>Demographic considerations</Text>
                    {selectedPlan.demographicNotes.map((item) => (
                      <Text key={item} style={styles.reportBullet}>
                        - {item}
                      </Text>
                    ))}
                  </>
                ) : null}
                <Text style={styles.reportSubheading}>3-Year Plan</Text>
                {selectedPlan.threeYearPlan.year1.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - Year 1: {item}
                  </Text>
                ))}
                {selectedPlan.threeYearPlan.year2.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - Year 2: {item}
                  </Text>
                ))}
                {selectedPlan.threeYearPlan.year3.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - Year 3: {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>5-Year Plan</Text>
                {selectedPlan.fiveYearPlan.year4.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - Year 4: {item}
                  </Text>
                ))}
                {selectedPlan.fiveYearPlan.year5.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - Year 5: {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>Learning Path</Text>
                {selectedPlan.learningPath.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>Projects</Text>
                {selectedPlan.projects.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>Earnings Strategy</Text>
                {selectedPlan.earningsStrategy.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>Differentials</Text>
                {selectedPlan.differentials.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
                <Text style={styles.reportSubheading}>Real-life Examples</Text>
                {selectedPlan.examples.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.helper}>
                Run AI analysis to generate detailed career plans.
              </Text>
            )}
          </CollapsibleCard>

          <CollapsibleCard title={report.earningsMaximization.title}>
            <ReportSectionBody section={report.earningsMaximization} />
          </CollapsibleCard>
          <CollapsibleCard title={report.opportunityMap.title}>
            <ReportSectionBody section={report.opportunityMap} />
          </CollapsibleCard>
          <CollapsibleCard title={report.actionPlan.title}>
            <ReportSectionBody section={report.actionPlan} />
          </CollapsibleCard>
          <CollapsibleCard title={report.gapAnalysis.title}>
            <ReportSectionBody section={report.gapAnalysis} />
          </CollapsibleCard>
          <CollapsibleCard title={report.demographicStrategy.title}>
            <ReportSectionBody section={report.demographicStrategy} />
          </CollapsibleCard>
          {report.entrepreneurshipPlan ? (
            <CollapsibleCard title={report.entrepreneurshipPlan.title}>
              <ReportSectionBody section={report.entrepreneurshipPlan} />
            </CollapsibleCard>
          ) : null}

          {renderChatSection({
            title: 'Ask the career agent (Atlas)',
            question: careerQuestion,
            setQuestion: setCareerQuestion,
            onSend: handleCareerAgentChat,
            status: careerChatStatus,
            thread: careerThread,
            buttonLabel: 'Ask Atlas',
            placeholder: 'Ask about career transitions or promotion strategy.',
          })}
        </Card>
      );
    }

    if (activeCard === 'ats') {
      return (
        <Card title="ATS Analysis" subtitle="Resume scan and formatting guidance.">
          {report.resumeAnalysis ? (
            <View style={styles.reportCard}>
              <Text style={styles.reportText}>
                ATS score: {report.resumeAnalysis.atsScore} (
                {report.resumeAnalysis.atsReadiness})
              </Text>
              <Text style={styles.reportText}>{report.resumeAnalysis.atsSummary}</Text>
              <Text style={styles.reportMeta}>
                Word count: {report.resumeAnalysis.wordCount} | Keyword coverage:{' '}
                {report.resumeAnalysis.keywordCoverage}%
              </Text>
              <Text style={styles.reportSubheading}>Sections detected</Text>
              {report.resumeAnalysis.sectionsPresent.length ? (
                report.resumeAnalysis.sectionsPresent.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))
              ) : (
                <Text style={styles.reportBullet}>- None detected</Text>
              )}
              {report.resumeAnalysis.missingSections.length ? (
                <>
                  <Text style={styles.reportSubheading}>Missing sections</Text>
                  {report.resumeAnalysis.missingSections.map((item) => (
                    <Text key={item} style={styles.reportBullet}>
                      - {item}
                    </Text>
                  ))}
                </>
              ) : null}
              {report.resumeAnalysis.flags.length ? (
                <>
                  <Text style={styles.reportSubheading}>ATS flags</Text>
                  {report.resumeAnalysis.flags.map((item) => (
                    <Text key={item} style={styles.reportBullet}>
                      - {item}
                    </Text>
                  ))}
                </>
              ) : null}
              <Text style={styles.reportSubheading}>Recommendations</Text>
              {report.resumeAnalysis.recommendations.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              {report.resumeAnalysis.atsReadiness !== 'High' && !showAtsDetail ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => setShowAtsDetail(true)}
                >
                  <Text style={styles.secondaryButtonText}>
                    View detailed resume analysis
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={styles.helper}>
              Run AI analysis to generate ATS scan results.
            </Text>
          )}

          {report.resumeAnalysis && showAtsDetail ? (
            <>
              <CollapsibleCard title="ATS formatting risks" defaultCollapsed={false}>
                {report.resumeAnalysis.flags.length ? (
                  report.resumeAnalysis.flags.map((item) => (
                    <Text key={item} style={styles.reportBullet}>
                      - {item}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.reportText}>No ATS risk flags detected.</Text>
                )}
              </CollapsibleCard>
              <CollapsibleCard title="Format and wording recommendations" defaultCollapsed={false}>
                {report.resumeAnalysis.recommendations.map((item) => (
                  <Text key={item} style={styles.reportBullet}>
                    - {item}
                  </Text>
                ))}
              </CollapsibleCard>
            </>
          ) : null}

          {renderChatSection({
            title: 'Ask the ATS agent (Helix)',
            question: atsQuestion,
            setQuestion: setAtsQuestion,
            onSend: handleAtsAgentChat,
            status: atsChatStatus,
            thread: atsThread,
            buttonLabel: 'Ask Helix',
            placeholder: 'Ask about ATS improvements or formatting changes.',
          })}
        </Card>
      );
    }

    if (activeCard === 'network') {
      return (
        <Card title="Network Analysis" subtitle="LinkedIn connections and outreach plan.">
          {report.networkReport ? (
            <CollapsibleCard title="LinkedIn Network Analysis" defaultCollapsed={false}>
              <Text style={styles.reportText}>
                Total connections: {report.networkReport.totalConnections}
              </Text>
              <Text style={styles.reportSubheading}>Industry breakdown</Text>
              {report.networkReport.industryBreakdown.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Seniority breakdown</Text>
              {report.networkReport.seniorityBreakdown.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Company breakdown</Text>
              {report.networkReport.companyBreakdown.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Geography</Text>
              {report.networkReport.geographyBreakdown.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Hiring managers</Text>
              {report.networkReport.hiringManagers.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Recruiters</Text>
              {report.networkReport.recruiters.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Warm introduction paths</Text>
              {report.networkReport.warmIntroductions.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Priority order</Text>
              {report.networkReport.priorityOrder.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Outreach templates</Text>
              {report.networkReport.outreachTemplates.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>What to ask for</Text>
              {report.networkReport.whatToAsk.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Network gaps</Text>
              {report.networkReport.gaps.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Networking action plan</Text>
              {report.networkReport.actionPlan.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
            </CollapsibleCard>
          ) : (
            <Text style={styles.helper}>
              Run AI analysis to generate network insights.
            </Text>
          )}

          {renderChatSection({
            title: 'Ask the network agent (Nexus)',
            question: networkQuestion,
            setQuestion: setNetworkQuestion,
            onSend: handleNetworkAgentChat,
            status: networkChatStatus,
            thread: networkThread,
            buttonLabel: 'Ask Nexus',
            placeholder: 'Ask about warm introductions or networking gaps.',
          })}
        </Card>
      );
    }

    if (activeCard === 'agent-chat') {
      return (
        <Card title="Agent Console" subtitle="Interact with Cipher and the agent team directly.">
          <Text style={styles.helper}>
            Cipher routes your question to the best agent(s) or spins up an on-demand agent if
            none match.
          </Text>
          {renderChatSection({
            title: 'Ask a question',
            question: agentQuestion,
            setQuestion: setAgentQuestion,
            onSend: handleAgentChat,
            status: agentChatStatus,
            thread: agentThread,
            buttonLabel: 'Ask Cipher',
            placeholder: 'Ask for career moves, negotiation prep, or strategy.',
          })}
        </Card>
      );
    }

    return (
      <Card title="Select a card" subtitle="Choose a section from the left menu." />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={[styles.appShell, isCompact ? styles.appShellCompact : null]}>
        <NavRail
          isCompact={isCompact}
          items={navItems.filter((item) => item.visible)}
          activeId={activeCard}
          onSelect={setActiveCard}
        />
        <ScrollView
          style={styles.mainContent}
          contentContainerStyle={styles.container}
        >
          <Text style={styles.title}>Cipher Career Strategist</Text>
          <Text style={styles.subtitle}>
            Web + mobile intelligence hub for AI-ready career strategy.
          </Text>
          {renderActiveCard()}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const Card = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    {children}
  </View>
);

const NavRail = ({
  isCompact,
  items,
  activeId,
  onSelect,
}: {
  isCompact: boolean;
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onSelect: (sectionId: string) => void;
}) => (
  <View style={[styles.navRail, isCompact ? styles.navRailCompact : null]}>
    <Text style={styles.navTitle}>Cipher</Text>
    {items.map((item) => (
      <Pressable
        key={item.id}
        style={[
          styles.navButton,
          activeId === item.id ? styles.navButtonActive : null,
        ]}
        onPress={() => onSelect(item.id)}
      >
        <Text
          style={[
            styles.navButtonText,
            activeId === item.id ? styles.navButtonTextActive : null,
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    ))}
  </View>
);

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  secureTextEntry?: boolean;
}) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={[styles.input, multiline ? styles.inputMultiline : null]}
      multiline={multiline}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
    />
  </View>
);

const ToggleRow = ({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) => (
  <View style={styles.toggleRow}>
    <Text style={styles.label}>{label}</Text>
    <Switch value={value} onValueChange={onValueChange} />
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const KpiTile = ({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) => (
  <View style={styles.kpiTile}>
    <Text style={styles.kpiLabel}>{label}</Text>
    <Text style={styles.kpiValue}>{value}</Text>
    {meta ? <Text style={styles.kpiMeta}>{meta}</Text> : null}
  </View>
);

const DashboardCard = ({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) => (
  <View style={styles.dashboardCard}>
    <Text style={styles.dashboardLabel}>{label}</Text>
    <Text style={styles.dashboardValue}>{value}</Text>
    {meta ? <Text style={styles.dashboardMeta}>{meta}</Text> : null}
  </View>
);

const trendConfig = {
  up: { label: 'Up', icon: '↑' },
  down: { label: 'Down', icon: '↓' },
  neutral: { label: 'Flat', icon: '→' },
};

const getSignalFromText = (value: string) => {
  const lowered = value.toLowerCase();
  const hasPositive = /\b(strong|good|high|growing|increase|rising|up)\b/i.test(lowered);
  const hasNegative = /\b(weak|bad|low|decline|decrease|falling|down)\b/i.test(lowered);
  let tone: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (hasPositive && !hasNegative) tone = 'positive';
  if (hasNegative && !hasPositive) tone = 'negative';

  const trend =
    /\b(rise|rising|increase|up|accelerat)\b/i.test(lowered)
      ? 'up'
      : /\b(fall|falling|decrease|down|slow)\b/i.test(lowered)
        ? 'down'
        : 'neutral';

  return { tone, trend };
};

const SignalRow = ({ text }: { text: string }) => {
  const signal = getSignalFromText(text);
  return (
    <View style={styles.signalRow}>
      <View
        style={[
          styles.signalDot,
          signal.tone === 'positive'
            ? styles.signalDotPositive
            : signal.tone === 'negative'
              ? styles.signalDotNegative
              : styles.signalDotNeutral,
        ]}
      />
      <Text style={styles.signalLabel}>
        {signal.tone === 'positive'
          ? 'Good'
          : signal.tone === 'negative'
            ? 'Bad'
            : 'Mixed'}
      </Text>
      <View style={styles.signalDivider} />
      <Text style={styles.signalTrendIcon}>{trendConfig[signal.trend].icon}</Text>
      <Text style={styles.signalTrendLabel}>{trendConfig[signal.trend].label} trend</Text>
    </View>
  );
};

const ReportSectionBody = ({
  section,
  showSignal = false,
}: {
  section: { title: string; summary: string; bullets?: string[] };
  showSignal?: boolean;
}) => (
  <View style={styles.reportDigest}>
    <Text style={styles.reportDigestLabel}>Key takeaway</Text>
    {showSignal ? <SignalRow text={section.summary} /> : null}
    <Text style={styles.reportDigestText} numberOfLines={3}>
      {section.summary}
    </Text>
    {section.bullets?.length ? (
      <View style={styles.reportChipRow}>
        {section.bullets.map((item) => (
          <View key={item} style={styles.reportChip}>
            <Text style={styles.reportChipText} numberOfLines={2}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    ) : null}
  </View>
);

const GraphicSectionBody = ({
  section,
  highlightMarket = false,
}: {
  section: { title: string; summary: string; bullets?: string[] };
  highlightMarket?: boolean;
}) => {
  const bullets = section.bullets ?? [];
  const highlightRules = highlightMarket
    ? [
        { key: 'salary', label: 'Salary range', matcher: /(salary|compensation|pay|\$)/i },
        { key: 'driver', label: 'Market driver', matcher: /(driver|catalyst|tailwind)/i },
        {
          key: 'indicators',
          label: 'Market indicators',
          matcher: /(indicator|signal|demand|hiring|open roles)/i,
        },
        {
          key: 'stats',
          label: 'Key statistics',
          matcher: /(stat|stats|%|percent|rate|growth|median|average|benchmark)/i,
        },
      ]
    : [];
  const highlightMap = new Map<string, { label: string; value: string }>();
  const remainingBullets: string[] = [];

  const extractMedianSalary = (value: string) => {
    const medianMatch = value.match(/median[^$]*(\$\s?[\d,]+(?:\.\d+)?[kKmM]?)/i);
    if (medianMatch?.[1]) {
      return medianMatch[1].replace(/\s+/g, ' ').trim();
    }
    const dollarMatches = value.match(/\$\s?[\d,]+(?:\.\d+)?[kKmM]?/g);
    if (!dollarMatches?.length) return null;
    const normalized = dollarMatches.map((entry) => entry.replace(/\s+/g, ' ').trim());
    const middleIndex = Math.floor((normalized.length - 1) / 2);
    return normalized[middleIndex];
  };

  const stripSalaryFromText = (value: string) => {
    const withoutMedian = value.replace(/median[^$]*\$\s?[\d,]+(?:\.\d+)?[kKmM]?/gi, '').trim();
    const withoutDollars = withoutMedian.replace(/\$\s?[\d,]+(?:\.\d+)?[kKmM]?/g, '').trim();
    return withoutDollars.replace(/\s{2,}/g, ' ').replace(/^[-–:]+/, '').trim();
  };

  bullets.forEach((item) => {
    const match = highlightRules.find(
      (rule) => !highlightMap.has(rule.key) && rule.matcher.test(item)
    );
    if (match) {
      highlightMap.set(match.key, { label: match.label, value: item });
    } else {
      remainingBullets.push(item);
    }
  });

  return (
    <View style={styles.graphicSection}>
      <View style={styles.graphicSummaryCard}>
        <Text style={styles.graphicLabel}>Summary</Text>
        {highlightMarket ? <SignalRow text={section.summary} /> : null}
        <Text style={styles.graphicSummaryText}>{section.summary}</Text>
      </View>
      {highlightMap.size ? (
        <View style={styles.highlightGrid}>
          {[...highlightMap.values()].map((highlight) => {
            const isSalary = highlight.label === 'Salary range';
            const medianSalary = isSalary ? extractMedianSalary(highlight.value) : null;
            const highlightText = isSalary
              ? stripSalaryFromText(highlight.value)
              : highlight.value;
            return (
              <View key={highlight.label} style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>{highlight.label}</Text>
                {highlightMarket ? <SignalRow text={highlight.value} /> : null}
                {isSalary && medianSalary ? (
                  <Text style={styles.highlightMedian}>Median salary: {medianSalary}</Text>
                ) : null}
                {highlightText ? (
                  <Text style={styles.highlightValue}>{highlightText}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {remainingBullets.length ? (
        <View style={styles.insightList}>
          {remainingBullets.map((item, index) => {
            return (
              <View
                key={item}
                style={[
                  styles.insightRow,
                  highlightMarket ? styles.marketInsightRow : null,
                ]}
              >
                {!highlightMarket ? (
                  <View style={styles.insightBadge}>
                    <Text style={styles.insightBadgeText}>{index + 1}</Text>
                  </View>
                ) : null}
                <View style={styles.insightContent}>
                  {highlightMarket ? <SignalRow text={item} /> : null}
                  <Text style={styles.insightText}>{item}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
};

const CollapsibleCard = ({
  title,
  children,
  defaultCollapsed = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <View style={styles.collapsibleCard}>
      <Pressable
        style={styles.collapsibleHeader}
        onPress={() => setCollapsed((prev) => !prev)}
      >
        <Text style={styles.reportTitle}>{title}</Text>
        <Text style={styles.collapsibleToggle}>{collapsed ? '+' : '-'}</Text>
      </Pressable>
      {!collapsed ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
};
const Chip = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    style={[styles.chip, selected ? styles.chipSelected : null]}
    onPress={onPress}
  >
    <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
      {label}
    </Text>
  </Pressable>
);

const ReportSectionView = ({
  section,
}: {
  section: { title: string; summary: string; bullets?: string[] };
}) => (
  <View style={styles.reportCard}>
    <Text style={styles.reportTitle}>{section.title}</Text>
    <ReportSectionBody section={section} />
  </View>
);

const SkillReportCard = ({
  skill,
  riskTone,
}: {
  skill: {
    name: string;
    category: string;
    marketValueScore: number;
    demandLevel: string;
    scarcity: string;
    compensationPremium: string;
    aiRisk: string;
    aiImpactTimeline: string;
    aiCan: string;
    aiCannot: string;
    transformation: string;
    humanEdge: string;
    aiTools: string[];
    industryOutlook: { industries: string[]; notes: string; sources: string[] };
    valueMaintenance: string[];
    projections: { threeYear: string; fiveYear: string; tenYear: string };
  };
  riskTone: 'low' | 'medium' | 'high';
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.skillSummaryCard}>
      <View style={styles.skillSummaryHeader}>
        <Text style={styles.skillName}>{skill.name}</Text>
        <Text style={styles.skillMeta}>{skill.category}</Text>
      </View>
      <View style={styles.skillMetricRow}>
        <View style={styles.skillMetric}>
          <Text style={styles.skillMetricLabel}>Market value</Text>
          <Text style={styles.skillMetricValue}>{skill.marketValueScore}</Text>
        </View>
        <View style={styles.skillMetric}>
          <Text style={styles.skillMetricLabel}>AI risk</Text>
          <View
            style={[
              styles.riskBadge,
              riskTone === 'high'
                ? styles.riskBadgeHigh
                : riskTone === 'medium'
                ? styles.riskBadgeMedium
                : styles.riskBadgeLow,
            ]}
          >
            <Text style={styles.riskBadgeText}>{skill.aiRisk}</Text>
          </View>
        </View>
      </View>
      <View style={styles.metricBar}>
        <View
          style={[
            styles.metricBarFill,
            { width: `${Math.min(100, skill.marketValueScore)}%` },
          ]}
        />
      </View>
      <View style={styles.skillTagRow}>
        <View style={styles.skillTag}>
          <Text style={styles.skillTagText}>Demand: {skill.demandLevel}</Text>
        </View>
        <View style={styles.skillTag}>
          <Text style={styles.skillTagText}>Scarcity: {skill.scarcity}</Text>
        </View>
        <View style={styles.skillTag}>
          <Text style={styles.skillTagText}>
            Premium: {skill.compensationPremium}
          </Text>
        </View>
        <View style={styles.skillTag}>
          <Text style={styles.skillTagText}>
            Timeline: {skill.aiImpactTimeline}
          </Text>
        </View>
      </View>
      <Pressable style={styles.linkButton} onPress={() => setExpanded((prev) => !prev)}>
        <Text style={styles.linkButtonText}>
          {expanded ? 'Hide detail' : 'View detail'}
        </Text>
      </Pressable>
      {expanded ? (
        <View style={styles.skillDetail}>
          <Text style={styles.reportText}>AI can: {skill.aiCan}</Text>
          <Text style={styles.reportText}>AI cannot: {skill.aiCannot}</Text>
          <Text style={styles.reportText}>Transformation: {skill.transformation}</Text>
          <Text style={styles.reportText}>Human edge: {skill.humanEdge}</Text>
          {skill.aiTools.length ? (
            <Text style={styles.reportText}>Tools: {skill.aiTools.join(', ')}</Text>
          ) : null}
          <Text style={styles.reportText}>
            Industry outlook (US): {skill.industryOutlook.industries.join(', ')}
          </Text>
          <Text style={styles.reportText}>
            Outlook notes: {skill.industryOutlook.notes}
          </Text>
          <Text style={styles.reportText}>
            Sources: {skill.industryOutlook.sources.join(', ')}
          </Text>
          <Text style={styles.reportText}>
            10-year value strategy: {skill.valueMaintenance.join(' ')}
          </Text>
          <Text style={styles.reportText}>
            Projections: {skill.projections.threeYear} | {skill.projections.fiveYear} |{' '}
            {skill.projections.tenYear}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const colors = {
  background: '#0f1117',
  card: '#171a23',
  border: '#2b313d',
  text: '#f4f6fb',
  muted: '#9aa4b2',
  accent: '#5b8def',
  accentStrong: '#6c9dff',
  danger: '#e26d6d',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appShell: {
    flex: 1,
    flexDirection: 'row',
  },
  appShellCompact: {
    flexDirection: 'column',
  },
  mainContent: {
    flex: 1,
  },
  navRail: {
    width: 200,
    backgroundColor: '#0b0e16',
    paddingTop: 24,
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  navRailCompact: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  navButton: {
    backgroundColor: '#121725',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  navButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  navButtonTextActive: {
    color: '#fff',
  },
  container: {
    padding: 20,
    paddingBottom: 80,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 20,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionSubtitle: {
    color: colors.muted,
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0f1320',
    borderRadius: 10,
    padding: 10,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoRow: {
    marginBottom: 10,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  infoValue: {
    color: colors.text,
    marginTop: 2,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: colors.accentStrong,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: colors.accentStrong,
    fontWeight: '600',
  },
  helper: {
    color: colors.muted,
    marginBottom: 8,
  },
  missingText: {
    color: colors.danger,
  },
  skillName: {
    color: colors.text,
    fontWeight: '600',
  },
  skillMeta: {
    color: colors.muted,
    marginTop: 4,
  },
  agentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  dashboardCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    minWidth: 160,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dashboardLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  dashboardValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
  },
  dashboardMeta: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 12,
  },
  kpiTile: {
    backgroundColor: '#0f1320',
    borderRadius: 12,
    padding: 12,
    minWidth: 160,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  kpiLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  kpiMeta: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 12,
  },
  linkButton: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  linkButtonText: {
    color: colors.text,
  },
  collapsibleCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapsibleToggle: {
    color: colors.accentStrong,
    fontSize: 20,
    fontWeight: '700',
  },
  collapsibleBody: {
    marginTop: 8,
  },
  agentCard: {
    backgroundColor: '#121725',
    padding: 10,
    borderRadius: 10,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentName: {
    color: colors.text,
    fontWeight: '600',
  },
  agentRole: {
    color: colors.muted,
    marginTop: 4,
  },
  agentStatus: {
    color: colors.accentStrong,
    marginTop: 6,
    fontWeight: '600',
  },
  reportCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportDigest: {
    gap: 8,
  },
  reportDigestLabel: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  reportDigestText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  reportChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reportChip: {
    backgroundColor: '#0f1320',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  reportChipText: {
    color: colors.text,
    fontSize: 12,
  },
  marketFitCard: {
    gap: 12,
  },
  marketScopeGrid: {
    gap: 12,
  },
  marketGlobalSynopsisCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  marketSynopsisText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  marketScopeCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  marketScopeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  marketScopeSubtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  marketScopeText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  marketFitLabel: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  marketChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  marketChip: {
    backgroundColor: '#0f1320',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketChipStrong: {
    backgroundColor: '#1f3b2f',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2a6b4f',
  },
  marketChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  marketSignalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  marketSignalText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  marketInferenceText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  marketWaitingBanner: {
    borderWidth: 1,
    borderColor: '#f6c343',
    backgroundColor: 'rgba(246, 195, 67, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  marketWaitingText: {
    color: '#ffd166',
    fontSize: 13,
    lineHeight: 18,
  },
  marketGapBanner: {
    backgroundColor: '#1a1f2e',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketGapTitle: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  marketGapText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  marketPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0f1320',
  },
  marketPillDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  marketPillText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  marketTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f1320',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  marketTrendArrow: {
    fontSize: 22,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  marketExploreCard: {
    gap: 12,
  },
  marketExploreText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  marketCandidateCard: {
    gap: 10,
  },
  marketCandidateText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  marketCandidateList: {
    gap: 8,
  },
  marketCandidateRow: {
    backgroundColor: '#0f1320',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketCandidateStrong: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 4,
  },
  marketCandidateMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  graphicSection: {
    gap: 12,
  },
  graphicSummaryCard: {
    backgroundColor: '#0f1320',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  graphicLabel: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  graphicSummaryText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  highlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  highlightCard: {
    backgroundColor: '#131c2c',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    flexBasis: 180,
    flexGrow: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  highlightLabel: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  highlightValue: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flexShrink: 1,
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  highlightMedian: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  signalDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  signalDotPositive: {
    backgroundColor: '#37d67a',
  },
  signalDotNegative: {
    backgroundColor: '#ff6b6b',
  },
  signalDotNeutral: {
    backgroundColor: '#f6c343',
  },
  signalLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  signalDivider: {
    width: 1,
    height: 12,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  signalTrendIcon: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  signalTrendLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  insightList: {
    gap: 10,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  marketInsightRow: {
    paddingLeft: 12,
  },
  insightBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  insightContent: {
    flex: 1,
  },
  insightText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  skillSummaryCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  skillMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 10,
  },
  skillMetric: {
    backgroundColor: '#0f1320',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 140,
    flexGrow: 1,
  },
  skillMetricLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  skillMetricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  riskBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  riskBadgeHigh: {
    backgroundColor: '#472027',
  },
  riskBadgeMedium: {
    backgroundColor: '#3a2f1b',
  },
  riskBadgeLow: {
    backgroundColor: '#1f3b2f',
  },
  riskBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  metricBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0f1320',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  metricBarFill: {
    height: '100%',
    backgroundColor: colors.accentStrong,
  },
  skillTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  skillTag: {
    backgroundColor: '#0f1320',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillTagText: {
    color: colors.text,
    fontSize: 12,
  },
  skillDetail: {
    marginTop: 8,
    gap: 6,
  },
  skillHighlightCard: {
    backgroundColor: '#121725',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillHighlightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  skillHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  skillHighlightLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  skillHighlightValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  positionCard: {
    backgroundColor: '#0f1320',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatBubble: {
    backgroundColor: '#0f1320',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatSection: {
    marginTop: 12,
  },
  chatRole: {
    color: colors.accentStrong,
    fontWeight: '600',
    marginBottom: 4,
  },
  chatText: {
    color: colors.text,
  },
  reportTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 6,
  },
  reportText: {
    color: colors.text,
    marginBottom: 6,
  },
  reportMeta: {
    color: colors.muted,
    marginBottom: 6,
  },
  reportBullet: {
    color: colors.text,
    marginBottom: 4,
  },
  reportSubheading: {
    color: colors.accentStrong,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
});
