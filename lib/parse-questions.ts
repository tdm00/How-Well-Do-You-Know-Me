export type ParsedQuestion = { prompt: string; category: string | null };

const HEADER = /^(prompt|question)\s*,\s*(category|tag)?$/i;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

function clean(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Accepts a CSV with a `prompt,category` header, or pasted lines.
 * A pasted line is the whole prompt unless it contains ` | `, which separates
 * an optional category. Commas inside a pasted prompt stay part of the prompt.
 */
export function parseQuestionImport(text: string): ParsedQuestion[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const csvMode = HEADER.test(lines[0]);
  const body = csvMode ? lines.slice(1) : lines;
  const questions: ParsedQuestion[] = [];

  for (const line of body) {
    let prompt: string | null = null;
    let category: string | null = null;

    if (csvMode) {
      const cells = parseCsvLine(line);
      prompt = clean(cells[0]);
      category = clean(cells[1]);
    } else if (line.includes("|")) {
      const [left, ...rest] = line.split("|");
      prompt = clean(left);
      category = clean(rest.join("|"));
    } else {
      prompt = clean(line);
    }

    if (!prompt) continue;
    questions.push({
      prompt: prompt.slice(0, 200),
      category: category ? category.slice(0, 40) : null,
    });
  }

  return questions;
}
