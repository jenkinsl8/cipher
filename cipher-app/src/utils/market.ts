import { MarketSnapshot } from '../types';

type MarketEntry = {
  match: RegExp;
  snapshot: Omit<MarketSnapshot, 'updatedAt'>;
};

const MARKET_ENTRIES: MarketEntry[] = [
  {
    match: /columbus,\s*oh/i,
    snapshot: {
      indicators: 'Midwest labor market steady; finance and insurance remain resilient.',
      hiringTrends: 'Banking, insurance, and enterprise IT roles show moderate hiring.',
      layoffs: 'No major regional spikes reported; watch national tech volatility.',
      funding: 'Regional fintech activity stable; fewer late-stage rounds.',
      aiTrends: 'AI governance and risk roles increasing in financial services.',
      sources: 'BLS OH data, regional employer reports, LinkedIn trends.',
    },
  },
  {
    match: /new york,\s*ny/i,
    snapshot: {
      indicators: 'Financial services hiring mixed; compliance and risk roles stable.',
      hiringTrends: 'Demand for AI risk, cybersecurity, and cloud modernization.',
      layoffs: 'Selective reductions in consumer tech and media.',
      funding: 'Fintech funding cautious; AI tooling still active.',
      aiTrends: 'Banks building AI governance teams and model risk roles.',
      sources: 'BLS NY data, NYDFS updates, LinkedIn trends.',
    },
  },
  {
    match: /san francisco,\s*ca|bay area/i,
    snapshot: {
      indicators: 'Tech hiring stabilizing; AI roles remain premium.',
      hiringTrends: 'Strong demand in AI engineering, infra, and platform roles.',
      layoffs: 'Selective in consumer apps; enterprise AI teams expanding.',
      funding: 'AI-first funding active; more seed and Series A activity.',
      aiTrends: 'Rapid adoption of AI tooling; governance and safety roles rising.',
      sources: 'BLS CA data, VC reports, LinkedIn trends.',
    },
  },
  {
    match: /london,\s*uk|united kingdom/i,
    snapshot: {
      indicators: 'UK hiring steady; regulated industries show resilience.',
      hiringTrends: 'Strong demand in fintech, compliance, and AI governance.',
      layoffs: 'Muted outside consumer tech.',
      funding: 'Fintech funding cautious but active in AI infra.',
      aiTrends: 'Regulators pushing AI risk management frameworks.',
      sources: 'ONS labor data, FCA updates, LinkedIn trends.',
    },
  },
];

const DEFAULT_SNAPSHOT: Omit<MarketSnapshot, 'updatedAt'> = {
  indicators: 'Add local market indicators based on your region and industry.',
  hiringTrends: 'Provide regional hiring signals once location is set.',
  layoffs: 'Monitor layoffs in your sector.',
  funding: 'Track funding rounds and expansions relevant to your location.',
  aiTrends: 'Identify AI hiring or automation announcements locally.',
  sources: 'BLS, LinkedIn Workforce Reports, WEF, or local labor data.',
};

export const getMarketSnapshotForLocation = (location: string): MarketSnapshot => {
  const updatedAt = new Date().toISOString().slice(0, 10);
  if (!location.trim()) {
    return { updatedAt: '', ...DEFAULT_SNAPSHOT };
  }

  const entry = MARKET_ENTRIES.find((item) => item.match.test(location));
  return {
    updatedAt,
    ...(entry ? entry.snapshot : DEFAULT_SNAPSHOT),
  };
};
