const DEFAULT_MAX_FILE_MB = 8;
const DEFAULT_ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type ValidationResult =
  | { ok: true; error?: undefined }
  | { ok: false; error: "invalid-type" | "file-too-large" };

export interface FileDescriptor {
  size: number;
  type: string;
  name?: string;
}

const bytesInOneMb = 1_048_576;

const parseAllowedMime = (): readonly string[] => {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_MIME;
  if (!raw) {
    return DEFAULT_ALLOWED_MIME;
  }

  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return values.length > 0 ? values : DEFAULT_ALLOWED_MIME;
};

const resolveMaxBytes = (): number => {
  const raw = process.env.NEXT_PUBLIC_MAX_FILE_MB;
  if (!raw) {
    return DEFAULT_MAX_FILE_MB * bytesInOneMb;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_FILE_MB * bytesInOneMb;
  }

  return parsed * bytesInOneMb;
};

export const validateFile = (file: FileDescriptor): ValidationResult => {
  const allowedTypes = parseAllowedMime();
  const maxBytes = resolveMaxBytes();

  if (!allowedTypes.includes(file.type)) {
    return { ok: false, error: "invalid-type" };
  }

  if (file.size > maxBytes) {
    return { ok: false, error: "file-too-large" };
  }

  return { ok: true };
};
