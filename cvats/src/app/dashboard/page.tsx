"use client";

import type { FormEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUploadToCloudinary, type UploadStatus } from "@/hooks/use-upload-to-cloudinary";
import { validateFile } from "@/lib/validate-file";

interface CvSummary {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  publicId?: string | null;
}

type FetchState = "idle" | "loading" | "error";
interface UploadFormProps {
  status: UploadStatus;
  statusMessage: string | null;
  hasError: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileChange: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  maxFileLabel: string;
}

interface CvListProps {
  cvs: CvSummary[];
  fetchState: FetchState;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1_048_576) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1_048_576).toFixed(1)} MB`;
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString();
};

const statusLabel = (status: UploadStatus, fallback: string | null, error: string | null) => {
  if (error) {
    return error;
  }

  if (status === "uploading") {
    return "Uploading to Cloudinary…";
  }

  if (status === "success") {
    return fallback ?? "Upload saved.";
  }

  return fallback;
};

const UploadForm = ({
  status,
  statusMessage,
  hasError,
  onSubmit,
  onFileChange,
  inputRef,
  maxFileLabel,
}: UploadFormProps) => (
  <section className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <label htmlFor="cv-upload" className="text-sm font-medium text-[#0f172a]">
        Upload a PDF or DOCX resume
      </label>
      <input
        ref={inputRef}
        id="cv-upload"
        name="cv-upload"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFileChange}
        className="rounded-md border border-[#cbd5f5] px-3 py-2 text-sm"
      />
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#64748b]">
          Max size: {maxFileLabel} MB • Approved types: PDF, DOCX
        </p>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-[#93c5fd]"
          disabled={status === "uploading"}
        >
          {status === "uploading" ? "Uploading…" : "Upload file"}
        </button>
      </div>
      {statusMessage && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            hasError ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#dcfce7] text-[#166534]"
          }`}
        >
          {statusMessage}
        </div>
      )}
    </form>
  </section>
);

const CvList = ({ cvs, fetchState }: CvListProps) => (
  <section className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
    <header className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-[#0f172a]">My CVs</h2>
      <Link
        href="/"
        className="text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] hover:underline"
      >
        Back to marketing site
      </Link>
    </header>

    {fetchState === "loading" && (
      <p className="mt-6 text-sm text-[#475569]">Loading existing uploads…</p>
    )}

    {fetchState === "error" && (
      <p className="mt-6 text-sm text-[#b91c1c]">
        We could not load your CVs. Please refresh to try again.
      </p>
    )}

    {fetchState === "idle" && cvs.length === 0 && (
      <p className="mt-6 text-sm text-[#475569]">
        No uploads yet. Choose a PDF or DOCX resume to get started.
      </p>
    )}

    {cvs.length > 0 && (
      <ul className="mt-6 space-y-4">
        {cvs.map((cv) => (
          <li
            key={cv.id}
            className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm transition hover:border-[#cbd5f5]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={cv.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#1e3a8a] hover:underline"
              >
                {cv.fileName}
              </a>
              <span className="text-xs text-[#64748b]">{formatTimestamp(cv.uploadedAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#475569]">
              <span>{cv.mimeType}</span>
              <span>{formatBytes(cv.fileSize)}</span>
              {cv.publicId ? <span>Cloudinary ID: {cv.publicId}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default function DashboardPage() {
  const [cvs, setCvs] = useState<CvSummary[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [clientError, setClientError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, error: uploadError, upload, reset } = useUploadToCloudinary();

  const loadCvs = useCallback(async () => {
    setFetchState("loading");
    try {
      const response = await fetch("/api/uploads", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load CVs.");
      }

      const data = (await response.json()) as { cvs?: CvSummary[] };
      setCvs(Array.isArray(data.cvs) ? data.cvs : []);
      setFetchState("idle");
    } catch (err) {
      console.error(err);
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void loadCvs();
  }, [loadCvs]);

  const handleFileChange = useCallback(() => {
    setClientError(null);
    setSuccessMessage(null);
    reset();
  }, [reset]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setClientError(null);
      setSuccessMessage(null);

      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setClientError("Please choose a PDF or DOCX file before uploading.");
        return;
      }

      const validation = validateFile({
        size: file.size,
        type: file.type,
        name: file.name,
      });

      if (!validation.ok) {
        const message =
          validation.error === "invalid-type"
            ? "Only PDF or DOCX files are allowed."
            : "File is larger than the permitted limit.";
        setClientError(message);
        return;
      }

      try {
        const cloudinary = await upload(file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl: cloudinary.fileUrl,
            originalName: file.name,
            mime: file.type,
            size: file.size,
            publicId: cloudinary.publicId,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Failed to persist CV metadata.");
        }

        const payload = (await response.json()) as { cv: CvSummary };
        setCvs((existing) => [payload.cv, ...existing]);
        setSuccessMessage(`Uploaded ${payload.cv.fileName}.`);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected upload failure.";
        setClientError(message);
      }
    },
    [upload],
  );

  const statusMessage = useMemo(
    () => statusLabel(status, successMessage, clientError ?? uploadError),
    [status, successMessage, clientError, uploadError],
  );

  const maxFileLabel = process.env.NEXT_PUBLIC_MAX_FILE_MB ?? "8";

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-4xl flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#94a3b8]">
          Dashboard
        </p>
        <h1 className="text-3xl font-semibold text-[#0f172a]">My CVs</h1>
        <p className="text-sm text-[#475569]">
          Upload resumes directly to Cloudinary using the unsigned preset. CVATS stores only the
          resulting URL and metadata for downstream analysis.
        </p>
      </header>

      <UploadForm
        status={status}
        statusMessage={statusMessage}
        hasError={Boolean(clientError ?? uploadError)}
        onSubmit={handleSubmit}
        onFileChange={handleFileChange}
        inputRef={fileInputRef}
        maxFileLabel={maxFileLabel}
      />

      <CvList cvs={cvs} fetchState={fetchState} />
    </main>
  );
}
