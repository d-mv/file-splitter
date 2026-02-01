type SplitBy = "bytes" | "characters" | "lines";

type SplitTextOptions = {
  max: number;
  by: SplitBy;
  paragraphs?: boolean;
  headers?: boolean;
  headerTemplate?: string;
};

const defaultHeaderTemplate = "Chunk {index}/{total}\n";

const splitByBytes = (input: string, max: number): string[] => {
  const chunks: string[] = [];
  let current = "";
  let currentSize = 0;

  for (const char of input) {
    const charSize = Buffer.byteLength(char, "utf8");
    if (currentSize + charSize > max && current.length > 0) {
      chunks.push(current);
      current = "";
      currentSize = 0;
    }
    current += char;
    currentSize += charSize;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

const splitByCharacters = (input: string, max: number): string[] => {
  const chars = Array.from(input);
  const chunks: string[] = [];

  for (let i = 0; i < chars.length; i += max) {
    chunks.push(chars.slice(i, i + max).join(""));
  }

  return chunks;
};

const splitByLines = (input: string, max: number): string[] => {
  const lines = input.match(/[^\n]*\n|[^\n]+/g) ?? [];
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += max) {
    chunks.push(lines.slice(i, i + max).join(""));
  }

  return chunks;
};

const paragraphSeparator = "\n\n";

const splitParagraphs = (input: string): string[] => {
  return input.split(/\n\s*\n/);
};

const paragraphSize = (paragraph: string, by: SplitBy): number => {
  if (by === "bytes") {
    return Buffer.byteLength(paragraph, "utf8");
  }
  if (by === "lines") {
    return paragraph.split("\n").length;
  }
  return Array.from(paragraph).length;
};

const chunkWithParagraphs = (
  paragraphs: string[],
  options: { max: number; by: SplitBy },
): string[] => {
  const chunks: string[] = [];
  let current = "";
  let currentSize = 0;

  for (const paragraph of paragraphs) {
    const size = paragraphSize(paragraph, options.by);
    if (current.length === 0) {
      current = paragraph;
      currentSize = size;
      continue;
    }

    const separatorSize = paragraphSize(paragraphSeparator, options.by);
    if (currentSize + separatorSize + size <= options.max) {
      current += paragraphSeparator + paragraph;
      currentSize += separatorSize + size;
      continue;
    }

    chunks.push(current);
    current = paragraph;
    currentSize = size;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

const applyHeaders = (
  chunks: string[],
  options: { headers?: boolean; headerTemplate?: string },
): string[] => {
  if (!options.headers) {
    return chunks;
  }

  const template = options.headerTemplate ?? defaultHeaderTemplate;
  const total = chunks.length;

  return chunks.map((chunk, index) => {
    const header = template
      .replaceAll("{index}", String(index + 1))
      .replaceAll("{total}", String(total));
    return `${header}${chunk}`;
  });
};

export const splitText = (input: string, options: SplitTextOptions): string[] => {
  let chunks: string[];

  if (options.paragraphs) {
    const paragraphs = splitParagraphs(input);
    chunks = chunkWithParagraphs(paragraphs, { max: options.max, by: options.by });
  } else if (options.by === "bytes") {
    chunks = splitByBytes(input, options.max);
  } else if (options.by === "lines") {
    chunks = splitByLines(input, options.max);
  } else {
    chunks = splitByCharacters(input, options.max);
  }

  return applyHeaders(chunks, options);
};
