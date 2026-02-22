import { LinkedInConnection } from '../types';

type CsvParseResult = {
  rows: string[][];
};

const normalizeHeader = (value: string) => value.trim().toLowerCase();

export const parseCsv = (text: string): CsvParseResult => {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = '';
  };

  const pushRow = () => {
    rows.push(current);
    current = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      pushField();
      pushRow();
      continue;
    }

    field += char;
  }

  if (field.length > 0 || current.length > 0) {
    pushField();
    pushRow();
  }

  return { rows };
};

export const parseLinkedInConnections = (csvText: string): LinkedInConnection[] => {
  if (!csvText.trim()) {
    return [];
  }

  const parsed = parseCsv(csvText);
  const expectedHeaderLabels = [
    'First Name',
    'Last Name',
    'URL',
    'Email Address',
    'Company',
    'Position',
    'Connected On',
    'Connection on',
  ];
  const expectedHeaders = new Set(expectedHeaderLabels.map(normalizeHeader));

  const headerRowIndex = parsed.rows.slice(0, 5).findIndex((row) => {
    const normalizedRow = row.map(normalizeHeader);
    return (
      normalizedRow.includes(normalizeHeader('First Name')) &&
      normalizedRow.includes(normalizeHeader('Last Name')) &&
      normalizedRow.some((cell) => expectedHeaders.has(cell))
    );
  });

  if (headerRowIndex < 0) {
    return [];
  }

  const headers = parsed.rows[headerRowIndex].map(normalizeHeader);

  const indexOf = (...headerNames: string[]) =>
    headers.findIndex((header) => headerNames.some((name) => header === normalizeHeader(name)));

  const firstNameIdx = indexOf('First Name');
  const lastNameIdx = indexOf('Last Name');
  const urlIdx = indexOf('URL');
  const emailIdx = indexOf('Email Address');
  const companyIdx = indexOf('Company');
  const positionIdx = indexOf('Position');
  const connectedOnIdx = indexOf('Connected On', 'Connection on');
  const locationIdx = indexOf('Location');

  const getValue = (row: string[], index: number) =>
    index >= 0 && index < row.length ? row[index] : '';

  return parsed.rows.slice(headerRowIndex + 1).map((row) => ({
    firstName: getValue(row, firstNameIdx),
    lastName: getValue(row, lastNameIdx),
    url: getValue(row, urlIdx),
    email: getValue(row, emailIdx),
    company: getValue(row, companyIdx),
    position: getValue(row, positionIdx),
    connectedOn: getValue(row, connectedOnIdx),
    location: getValue(row, locationIdx),
  }));
};
