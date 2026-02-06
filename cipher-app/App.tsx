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
  View,
} from 'react-native';

import { generateCipherReport } from './src/engine/cipherEngine';
import { parseLinkedInConnections } from './src/utils/csv';
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
  MarketSnapshot,
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

const initialMarket: MarketSnapshot = {
  updatedAt: '',
  indicators: '',
  hiringTrends: '',
  layoffs: '',
  funding: '',
  aiTrends: '',
  sources: '',
};

const riskOptions: RiskTolerance[] = ['Low', 'Moderate', 'High'];
const aiOptions: AILiteracy[] = ['Beginner', 'Intermediate', 'Advanced'];
const goalOptions: CareerGoal[] = ['Stability', 'Growth', 'Entrepreneurship'];

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

const isHttpsContext = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'https:';
};

const isLocalUrl = (value: string) =>
  value.includes('localhost') || value.includes('127.0.0.1');

export default function App() {
  const [profile, setProfile] = useState<UserProfile>(initialProfile);
  const [market, setMarket] = useState<MarketSnapshot>(initialMarket);
  const [linkedInCsv, setLinkedInCsv] = useState('');
  const [linkedInStatus, setLinkedInStatus] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [resumeStatus, setResumeStatus] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');
  const [resumeFilePayload, setResumeFilePayload] = useState<{
    name: string;
    mimeType: string;
    data: string;
  } | null>(null);
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
    () => ({ ...resumeExtraction.profile, ...profile }),
    [profile, resumeExtraction.profile]
  );
  const report = useMemo(
    () => generateCipherReport(mergedProfile, resumeSkills, market, connections, resumeText),
    [mergedProfile, resumeSkills, market, connections, resumeText]
  );

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

  const updateProfile = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const updateMarket = <K extends keyof MarketSnapshot>(key: K, value: MarketSnapshot[K]) => {
    setMarket((prev) => ({ ...prev, [key]: value }));
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
        type: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets && result.assets[0];
      if (!asset?.uri) return;
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      setLinkedInCsv(content);
      setLinkedInStatus(`Loaded ${content.split('\n').length} lines.`);
    } catch (error) {
      setLinkedInStatus('Could not load the CSV file.');
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
          const binary = await readAssetBinary(asset);
          if (!binary?.length) {
            setResumeStatus('Could not read PDF data. Paste resume text.');
            return;
          }
          setResumeFilePayload({
            name,
            mimeType: mimeType || 'application/pdf',
            data: Buffer.from(binary).toString('base64'),
          });
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
            data: Buffer.from(binary).toString('base64'),
          });
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
          const binary = await readAssetBinary(asset);
          if (!binary?.length) {
            setResumeStatus('Could not read DOC data. Paste resume text.');
            return;
          }
          setResumeFilePayload({
            name,
            mimeType: mimeType || 'application/msword',
            data: Buffer.from(binary).toString('base64'),
          });
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
      setResumeFilePayload({
        name,
        mimeType: mimeType || 'text/plain',
        data: Buffer.from(content, 'utf8').toString('base64'),
      });
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
      status: market.updatedAt ? 'Synced' : 'Needs data',
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
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cipher Career Strategist</Text>
        <Text style={styles.subtitle}>
          Web + mobile intelligence hub for AI-ready career strategy.
        </Text>

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
        >
          <Text style={styles.helper}>
            Supports PDF, DOCX, DOC, or plain text. Cipher uses your resume to
            populate role, experience, education, and skills.
          </Text>
          <Text style={styles.helper}>
            PDF extraction is best-effort for text-based PDFs. If results look off, paste
            the resume text.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={handleResumePick}>
            <Text style={styles.secondaryButtonText}>
              {Platform.OS === 'web' ? 'Upload resume (web)' : 'Pick resume file'}
            </Text>
          </Pressable>
          {resumeFileName ? (
            <Text style={styles.helper}>Selected file: {resumeFileName}</Text>
          ) : null}
          {resumeStatus ? <Text style={styles.helper}>{resumeStatus}</Text> : null}
          <Field
            label="Or paste resume text here"
            value={resumeText}
            onChangeText={setResumeText}
            placeholder="Paste resume text for extraction and ATS scan"
            multiline
          />
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
              switch to the serverless parser. PDF files are sent directly to OpenAI.
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
              No skills detected yet. Ensure your resume includes a Skills section or
              paste the latest version.
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

        <Section
          title="Market Snapshot"
          subtitle="Provide recent market signals so Cipher can tailor advice."
        >
          <Field
            label="Date of latest market scan"
            value={market.updatedAt}
            onChangeText={(value) => updateMarket('updatedAt', value)}
            placeholder="e.g., 2026-02-05"
          />
          <Field
            label="Economic indicators"
            value={market.indicators}
            onChangeText={(value) => updateMarket('indicators', value)}
            placeholder="Unemployment, job openings, GDP notes"
            multiline
          />
          <Field
            label="Hiring trends"
            value={market.hiringTrends}
            onChangeText={(value) => updateMarket('hiringTrends', value)}
            placeholder="Which sectors are hiring or freezing?"
            multiline
          />
          <Field
            label="Layoff patterns"
            value={market.layoffs}
            onChangeText={(value) => updateMarket('layoffs', value)}
            placeholder="Recent layoffs or restructures"
            multiline
          />
          <Field
            label="Funding or M&A activity"
            value={market.funding}
            onChangeText={(value) => updateMarket('funding', value)}
            placeholder="Funding rounds, acquisitions, IPO notes"
            multiline
          />
          <Field
            label="AI hiring or automation trends"
            value={market.aiTrends}
            onChangeText={(value) => updateMarket('aiTrends', value)}
            placeholder="AI teams hiring, automation announcements"
            multiline
          />
          <Field
            label="Sources"
            value={market.sources}
            onChangeText={(value) => updateMarket('sources', value)}
            placeholder="BLS, LinkedIn, WEF, Glassdoor, etc."
          />
        </Section>

        <Section
          title="LinkedIn Network Analysis"
          subtitle="Upload Connections.csv or paste it for deeper insights."
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
          {linkedInStatus ? <Text style={styles.helper}>{linkedInStatus}</Text> : null}
          <Field
            label="Or paste Connections.csv here"
            value={linkedInCsv}
            onChangeText={setLinkedInCsv}
            placeholder="Paste CSV content"
            multiline
          />
          {connections.length ? (
            <Text style={styles.helper}>
              Parsed {connections.length} connections from LinkedIn CSV.
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

        <Section title="Cipher Report" subtitle="Generated insights and action plan.">
          <ReportSectionView section={report.marketSnapshot} />
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
      </ScrollView>
    </SafeAreaView>
  );
}

const Section = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
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
