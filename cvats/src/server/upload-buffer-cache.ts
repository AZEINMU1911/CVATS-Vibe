const bytesByPublicId = new Map<string, Buffer>();

export const rememberUploadBytes = (publicId: string, bytes: Buffer | null | undefined): void => {
  if (!publicId || !bytes || bytes.length === 0) {
    return;
  }
  bytesByPublicId.set(publicId, Buffer.from(bytes));
};

export const takeUploadBytes = (publicId: string | null | undefined): Buffer | null => {
  if (!publicId) {
    return null;
  }
  const buffer = bytesByPublicId.get(publicId) ?? null;
  if (buffer) {
    bytesByPublicId.delete(publicId);
    return Buffer.from(buffer);
  }
  return null;
};

export const clearUploadBytes = (): void => {
  bytesByPublicId.clear();
};
