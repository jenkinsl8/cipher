import { LinkedInConnection } from '../types';

type CsvParseResult = {
  headers: string[];
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

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows.shift() || [];
  return { headers, rows };
};

export const parseLinkedInConnections = (csvText: string): LinkedInConnection[] => {
  if (!csvText.trim()) {
    return [];
  }

  const parsed = parseCsv(csvText);
  const headers = parsed.headers.map(normalizeHeader);

  const indexOf = (headerName: string) =>
    headers.findIndex((header) => header === normalizeHeader(headerName));

  const firstNameIdx = indexOf('First Name');
  const lastNameIdx = indexOf('Last Name');
  const emailIdx = indexOf('Email Address');
  const companyIdx = indexOf('Company');
  const positionIdx = indexOf('Position');
  const connectedOnIdx = indexOf('Connected On');
  const locationIdx = indexOf('Location');

  const getValue = (row: string[], index: number) =>
    index >= 0 && index < row.length ? row[index] : '';

  return parsed.rows.map((row) => ({
    firstName: getValue(row, firstNameIdx),
    lastName: getValue(row, lastNameIdx),
    email: getValue(row, emailIdx),
    company: getValue(row, companyIdx),
    position: getValue(row, positionIdx),
    connectedOn: getValue(row, connectedOnIdx),
    location: getValue(row, locationIdx),
  }));
};
