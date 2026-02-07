import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';

import { generateCipherReport } from './src/engine/cipherEngine';
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
import {
  AILiteracy,
  CareerGoal,
  RiskTolerance,
  UserProfile,
  ResumeExtraction,
} from './src/types';
import { getMarketSnapshotForLocation } from './src/utils/market';

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
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<string, number>>({});
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
  const [showDetailedReport, setShowDetailedReport] = useState(false);
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
  const report = useMemo(
    () =>
      generateCipherReport(
        mergedProfile,
        resumeSkills,
        getMarketSnapshotForLocation(mergedProfile.location || ''),
        connections,
        resumeText
      ),
    [mergedProfile, resumeSkills, connections, resumeText]
  );

  const handleSectionLayout = (sectionId: string, y: number) => {
    sectionPositions.current[sectionId] = y;
  };

  const scrollToSection = (sectionId: string) => {
    if (sectionId === 'detailed-report' && !showDetailedReport) {
      setShowDetailedReport(true);
      setTimeout(() => {
        const y = sectionPositions.current[sectionId];
        if (typeof y === 'number') {
          scrollViewRef.current?.scrollTo({ y, animated: true });
        }
      }, 250);
      return;
    }

    const y = sectionPositions.current[sectionId];
    if (typeof y === 'number') {
      scrollViewRef.current?.scrollTo({ y, animated: true });
    }
  };

  const formatExpiryDate = (uploadedAt: number) =>
    new Date(uploadedAt + FILE_TTL_MS).toISOString().slice(0, 10);

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
    return missing;
  }, [profile, mergedProfile, resumeSkills, resumeText, resumeFilePayload]);

  useEffect(() => {
    setAiResumeExtraction(null);
    setAiStatus('');
    setUseAiParser(false);
    setLastAutoParsed('');
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

  const agentStatus = [
    { name: 'Cipher', role: 'Career strategist', status: 'Active' },
    {
      name: 'Sentinel',
      role: 'Market conditions',
      status: mergedProfile.location ? 'Synced' : 'Waiting for location',
    },
    {
      name: 'Aegis',
      role: 'AI impact',
      status: resumeSkills.length ? 'Ready' : 'Waiting for skills',
    },
    {
      name: 'Atlas',
      role: 'Career paths',
      status: mergedProfile.currentRole ? 'Ready' : 'Waiting for role',
    },
    {
      name: 'Nexus',
      role: 'Network analysis',
      status: connections.length ? 'Synced' : 'Waiting for LinkedIn data',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cipher Career Strategist</Text>
        <Text style={styles.subtitle}>
          Web + mobile intelligence hub for AI-ready career strategy.
        </Text>

        <Section
          title="Dashboard"
          subtitle="Snapshot and quick navigation"
          sectionId="dashboard"
          onLayout={handleSectionLayout}
        >
          <View style={styles.dashboardGrid}>
            <DashboardCard
              label="Resume"
              value={resumeFileName ? 'Uploaded' : 'Missing'}
              meta={resumeFileName || 'Upload resume to begin'}
            />
            <DashboardCard
              label="AI Parser"
              value={useAiParser ? 'AI Parsed' : 'Local Extract'}
              meta={aiStatus || (aiParserMode === 'openai' ? 'OpenAI mode' : 'Serverless')}
            />
            <DashboardCard
              label="ATS Score"
              value={
                report.resumeAnalysis?.atsScore !== undefined
                  ? `${report.resumeAnalysis.atsScore}`
                  : 'N/A'
              }
              meta={report.resumeAnalysis?.atsReadiness || 'Upload resume'}
            />
            <DashboardCard
              label="LinkedIn"
              value={connections.length ? `${connections.length} connections` : 'Not parsed'}
              meta={linkedInAiStatus || linkedInStatus || 'Upload connections file'}
            />
          </View>

          <View style={styles.dashboardGrid}>
            <DashboardCard
              label="Market Snapshot"
              value={mergedProfile.location || 'Location needed'}
              meta={report.marketSnapshot.summary}
            />
            <DashboardCard
              label="AI Resilience"
              value={report.aiResilience.title}
              meta={report.aiResilience.summary}
            />
            <DashboardCard
              label="AI Forward"
              value={report.aiForward.title}
              meta={report.aiForward.summary}
            />
            <DashboardCard
              label="Demographic Strategy"
              value={report.demographicStrategy.title}
              meta={report.demographicStrategy.summary}
            />
          </View>

          <Text style={styles.label}>Quick links</Text>
          <View style={styles.linkRow}>
            <LinkButton label="Resume Intake" onPress={() => scrollToSection('resume')} />
            <LinkButton label="AI Parser" onPress={() => scrollToSection('ai-parser')} />
            <LinkButton label="LinkedIn" onPress={() => scrollToSection('linkedin')} />
            <LinkButton label="Detailed Report" onPress={() => scrollToSection('detailed-report')} />
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => setShowDetailedReport((prev) => !prev)}
          >
            <Text style={styles.secondaryButtonText}>
              {showDetailedReport ? 'Hide detailed report' : 'Show detailed report'}
            </Text>
          </Pressable>
        </Section>

        <Section title="Agent Lineup" subtitle="Multi-agent workflow status">
          <View style={styles.agentGrid}>
            {agentStatus.map((agent) => (
              <View key={agent.name} style={styles.agentCard}>
                <Text style={styles.agentName}>{agent.name}</Text>
                <Text style={styles.agentRole}>{agent.role}</Text>
                <Text style={styles.agentStatus}>{agent.status}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section
          title="Resume Intake"
          subtitle="Upload your resume so Cipher can extract roles, education, and skills."
          sectionId="resume"
          onLayout={handleSectionLayout}
        >
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
        </Section>

        <Section
          title="AI Resume Parser (Recommended)"
          subtitle="Use an AI model to extract structured data from the resume."
          sectionId="ai-parser"
          onLayout={handleSectionLayout}
        >
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
        </Section>

        <Section
          title="Extracted Profile"
          subtitle="Auto-filled from your resume (review for accuracy)."
        >
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
        </Section>

        <Section title="Location and Mobility" subtitle="Confirm your preferences.">
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
        </Section>

        <Section
          title="Demographics (Required)"
          subtitle="Cipher uses this to provide realistic, tailored guidance."
        >
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
        </Section>

        <Section title="Experience Signals" subtitle="Transferable skills discovery">
          <Field
            label="Hobbies"
            value={profile.hobbies}
            onChangeText={(value) => updateProfile('hobbies', value)}
            placeholder="Activities that show skills"
            multiline
          />
          <Field
            label="Volunteer work"
            value={profile.volunteer}
            onChangeText={(value) => updateProfile('volunteer', value)}
            placeholder="Leadership or community work"
            multiline
          />
          <Field
            label="Side projects"
            value={profile.sideProjects}
            onChangeText={(value) => updateProfile('sideProjects', value)}
            placeholder="Portfolio or side initiatives"
            multiline
          />
          <Field
            label="Additional notes"
            value={profile.notes}
            onChangeText={(value) => updateProfile('notes', value)}
            placeholder="Anything else Cipher should know"
            multiline
          />
        </Section>

        <Section title="Goals and Risk Profile" subtitle="Define the path you want">
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
        </Section>

        <Section
          title="Extracted Skills"
          subtitle="Cipher pulls skills directly from your resume."
        >
          {resumeSkills.length === 0 ? (
            <Text style={styles.helper}>
              No skills detected yet. Ensure your resume includes a Skills section.
            </Text>
          ) : (
            resumeSkills.map((skill) => (
              <View key={skill.id} style={styles.skillCard}>
                <Text style={styles.skillName}>{skill.name}</Text>
                <Text style={styles.skillMeta}>{skill.category}</Text>
              </View>
            ))
          )}
        </Section>

        {showDetailedReport ? (
          <Section
            title="Market Snapshot (Auto)"
            subtitle="Cipher's market agent builds this from your location."
            sectionId="market"
            onLayout={handleSectionLayout}
          >
            <ReportSectionView section={report.marketSnapshot} />
          </Section>
        ) : null}

        <Section
          title="LinkedIn Network Analysis"
          subtitle="Upload your connections export for deeper insights."
          sectionId="linkedin"
          onLayout={handleSectionLayout}
        >
          <Text style={styles.helper}>
            Cipher can analyze your network to surface warm introductions, hiring
            managers, and gaps. Your data stays on device.
          </Text>
          <Text style={styles.helper}>
            Download steps: Settings &amp; Privacy {'>'} Data Privacy {'>'} Get a copy of your
            data {'>'} Connections {'>'} Request archive.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={handleLinkedInPick}>
            <Text style={styles.secondaryButtonText}>
              {Platform.OS === 'web' ? 'Upload CSV (web)' : 'Pick CSV file'}
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
        </Section>

        {missingFields.length ? (
          <Section
            title="Missing Required Inputs"
            subtitle="Complete these for full analysis."
          >
            {missingFields.map((field) => (
              <Text key={field} style={styles.missingText}>
                - {field}
              </Text>
            ))}
          </Section>
        ) : null}

        {showDetailedReport ? (
          <Section
            title="Detailed Report"
            subtitle="Generated insights and action plan."
            sectionId="detailed-report"
            onLayout={handleSectionLayout}
          >
            <ReportSectionView section={report.aiResilience} />
            <ReportSectionView section={report.aiForward} />
            <ReportSectionView section={report.demographicStrategy} />
            <ReportSectionView section={report.careerInsights} />

          <Text style={styles.sectionTitle}>Skills Portfolio</Text>
          {report.skillsPortfolio.length ? (
            report.skillsPortfolio.map((skill) => (
              <View key={skill.name} style={styles.reportCard}>
                <Text style={styles.reportTitle}>
                  {skill.name} ({skill.category})
                </Text>
                <Text style={styles.reportMeta}>
                  Market value score: {skill.marketValueScore} | Demand: {skill.demandLevel} |
                  Scarcity: {skill.scarcity} | Premium: {skill.compensationPremium}
                </Text>
                <Text style={styles.reportMeta}>
                  AI risk: {skill.aiRisk} ({skill.aiImpactTimeline})
                </Text>
                <Text style={styles.reportText}>AI can: {skill.aiCan}</Text>
                <Text style={styles.reportText}>AI cannot: {skill.aiCannot}</Text>
                <Text style={styles.reportText}>Transformation: {skill.transformation}</Text>
                <Text style={styles.reportText}>Human edge: {skill.humanEdge}</Text>
                {skill.aiTools.length ? (
                  <Text style={styles.reportText}>Tools: {skill.aiTools.join(', ')}</Text>
                ) : null}
                <Text style={styles.reportText}>
                  10-year value strategy: {skill.valueMaintenance.join(' ')}
                </Text>
                <Text style={styles.reportText}>
                  Projections: {skill.projections.threeYear} | {skill.projections.fiveYear} |{' '}
                  {skill.projections.tenYear}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.helper}>
              Upload your resume to generate the skills portfolio.
            </Text>
          )}

          <Text style={styles.sectionTitle}>Career Path Options</Text>
          {report.careerPaths.map((path) => (
            <View key={path.tier} style={styles.reportCard}>
              <Text style={styles.reportTitle}>{path.tier}</Text>
              <Text style={styles.reportText}>{path.title}</Text>
              <Text style={styles.reportText}>{path.overview}</Text>
              <Text style={styles.reportText}>Risk/reward: {path.riskReward}</Text>
              <Text style={styles.reportText}>
                Earning potential: {path.earningPotential}
              </Text>
              <Text style={styles.reportText}>AI resilience: {path.aiResilience}</Text>
              <Text style={styles.reportSubheading}>3-Year Plan</Text>
              {path.threeYearPlan.year1.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - Year 1: {item}
                </Text>
              ))}
              {path.threeYearPlan.year2.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - Year 2: {item}
                </Text>
              ))}
              {path.threeYearPlan.year3.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - Year 3: {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>5-Year Plan</Text>
              {path.fiveYearPlan.year4.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - Year 4: {item}
                </Text>
              ))}
              {path.fiveYearPlan.year5.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - Year 5: {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Learning Path</Text>
              {path.learningPath.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Projects</Text>
              {path.projects.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Earnings Strategy</Text>
              {path.earningsStrategy.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Differentials</Text>
              {path.differentials.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
              <Text style={styles.reportSubheading}>Real-life Examples</Text>
              {path.examples.map((item) => (
                <Text key={item} style={styles.reportBullet}>
                  - {item}
                </Text>
              ))}
            </View>
          ))}

          <ReportSectionView section={report.learningRoadmap} />
          <ReportSectionView section={report.skillsGapResources} />
          <ReportSectionView section={report.competencyMilestones} />
          <ReportSectionView section={report.projectsToPursue} />
          <ReportSectionView section={report.earningsMaximization} />
          <ReportSectionView section={report.opportunityMap} />
          <ReportSectionView section={report.gapAnalysis} />
          <ReportSectionView section={report.geographicOptions} />
          {report.internationalPlan ? (
            <ReportSectionView section={report.internationalPlan} />
          ) : null}
          {report.entrepreneurshipPlan ? (
            <ReportSectionView section={report.entrepreneurshipPlan} />
          ) : null}
          <ReportSectionView section={report.actionPlan} />
          <ReportSectionView section={report.marketOutlook} />

          {report.resumeAnalysis ? (
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>Resume ATS Scan</Text>
              <Text style={styles.reportText}>
                ATS score: {report.resumeAnalysis.atsScore} (
                {report.resumeAnalysis.atsReadiness})
              </Text>
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
            </View>
          ) : null}

          {report.networkReport ? (
            <View style={styles.reportCard}>
              <Text style={styles.reportTitle}>LinkedIn Network Analysis</Text>
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
            </View>
          ) : null}
          </Section>
        ) : (
          <Section title="Detailed Report" subtitle="Hidden for readability.">
            <Text style={styles.helper}>
              Use the dashboard to open the detailed report when you need the full output.
            </Text>
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({
  title,
  subtitle,
  children,
  sectionId,
  onLayout,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  sectionId?: string;
  onLayout?: (sectionId: string, y: number) => void;
}) => (
  <View
    style={styles.section}
    onLayout={(event) => {
      if (sectionId && onLayout) {
        onLayout(sectionId, event.nativeEvent.layout.y);
      }
    }}
  >
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    {children}
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

const LinkButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable style={styles.linkButton} onPress={onPress}>
    <Text style={styles.linkButtonText}>{label}</Text>
  </Pressable>
);
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

const ReportSectionView = ({ section }: { section: { title: string; summary: string; bullets?: string[] } }) => (
  <View style={styles.reportCard}>
    <Text style={styles.reportTitle}>{section.title}</Text>
    <Text style={styles.reportText}>{section.summary}</Text>
    {section.bullets?.map((item) => (
      <Text key={item} style={styles.reportBullet}>
        - {item}
      </Text>
    ))}
  </View>
);

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
  skillCard: {
    backgroundColor: '#121725',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
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
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
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
