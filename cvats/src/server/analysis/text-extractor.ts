const DEFAULT_ENCODING = "utf-8";

const fetchFileBuffer = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const normalizePdfText = (raw: string): string => {
  const matches = [...raw.matchAll(/\(([^)]+)\)/g)].map((match) => match[1] ?? "");
  if (matches.length === 0) {
    return raw;
  }

  return matches
    .map((segment) =>
      segment
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"),
    )
    .join(" ");
};

const extractPdfText = async (buffer: Buffer): Promise<string> => {
  const raw = buffer.toString(DEFAULT_ENCODING);
  return normalizePdfText(raw);
};

const extractDocxText = async (): Promise<string> => {
  // TODO: Implement DOCX text extraction using a lightweight parser.
  // Returning an empty string keeps scoring deterministic for now.
  return "";
};

export const extractTextFromBuffer = async (buffer: Buffer, mimeType: string): Promise<string> => {
  if (mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText();
  }

  return buffer.toString(DEFAULT_ENCODING);
};

export const extractTextFromFile = async (url: string, mimeType: string): Promise<string> => {
  const buffer = await fetchFileBuffer(url);
  return extractTextFromBuffer(buffer, mimeType);
};
