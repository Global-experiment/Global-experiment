/**
 * The CSV file of a People or Organizations import (decision of
 * 2026-10-23): UTF-8 (a byte-order mark is fine), comma or semicolon
 * separated, a header row, RFC 4180 quoting (quotes double inside quoted
 * cells, which may hold separators and line breaks). Anything else is a
 * file-level error with a sentence the admin can act on.
 */

export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 5_000;
export const CSV_MAX_COLUMNS = 60;

export interface ParsedCsv {
  delimiter: "," | ";";
  headers: string[];
  /** Data rows (cells per header, padded with ""), with their line in the file (the header is line 1). */
  rows: { line: number; cells: string[]; extraCells: boolean }[];
}

export class CsvFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFileError";
  }
}

/** The header line's separator: the one of "," and ";" found most often outside quotes. */
function detectDelimiter(text: string): "," | ";" {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ",") commas++;
    else if (!quoted && char === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

/** Records of cells, each with the line it starts on. */
function records(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let i = 0;
  const endRecord = () => {
    cells.push(cell);
    out.push({ line: start, cells });
    cells = [];
    cell = "";
  };
  while (i < text.length) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      i++;
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\r" || char === "\n") {
      endRecord();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else {
      cell += char;
    }
    i++;
  }
  if (quoted) throw new CsvFileError(`A quoted value starting on line ${start} is never closed: check the quotes in the file.`);
  if (cell !== "" || cells.length > 0) endRecord();
  return out;
}

export function parseCsv(bytes: Uint8Array): ParsedCsv {
  if (bytes.length === 0) throw new CsvFileError("The file is empty.");
  if (bytes.length > CSV_MAX_BYTES) throw new CsvFileError(`The file is larger than ${CSV_MAX_BYTES / 1024 / 1024} MB: split it into smaller files.`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new CsvFileError("The file isn't UTF-8 text. Export it again as \"CSV UTF-8\".");
  }
  if (text.includes("\u0000")) throw new CsvFileError("This isn't a CSV text file.");
  const delimiter = detectDelimiter(text);
  const all = records(text, delimiter).filter((record) => record.cells.some((cell) => cell.trim() !== ""));
  const [header, ...data] = all;
  if (!header) throw new CsvFileError("The file has no header row.");
  const headers = header.cells.map((name, index) => name.trim() || `Column ${index + 1}`);
  if (headers.length < 1 || header.cells.every((cell) => cell.trim() === "")) throw new CsvFileError("The first row must name the columns.");
  if (headers.length > CSV_MAX_COLUMNS) throw new CsvFileError(`The file has ${headers.length} columns; at most ${CSV_MAX_COLUMNS} can be read.`);
  const seen = new Set<string>();
  for (const name of headers) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new CsvFileError(`Two columns are named "${name}": rename one of them.`);
    seen.add(key);
  }
  if (data.length === 0) throw new CsvFileError("The file has a header row but no data rows.");
  if (data.length > CSV_MAX_ROWS) throw new CsvFileError(`The file has ${data.length} rows; at most ${CSV_MAX_ROWS} can be imported at once.`);
  return {
    delimiter,
    headers,
    rows: data.map((record) => ({
      line: record.line,
      cells: headers.map((_name, index) => (record.cells[index] ?? "").trim()),
      extraCells: record.cells.slice(headers.length).some((cell) => cell.trim() !== ""),
    })),
  };
}
