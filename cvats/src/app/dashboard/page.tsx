"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
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

const UploadFormSection = ({ children }: { children: ReactNode }) => (
  <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm transition dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
    {children}
  </section>
);

const UploadFormHeader = () => (
  <div className="flex flex-col gap-2">
    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
      Upload
    </p>
    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
      Upload a PDF or DOCX resume
    </h2>
    <p className="text-sm text-slate-500 dark:text-slate-300">
      Drag and drop a file or choose one from your device. We&apos;ll send it straight to Cloudinary
      and store only the metadata.
    </p>
  </div>
);

const UploadDropzone = ({
  inputRef,
  onFileChange,
  maxFileLabel,
}: Pick<UploadFormProps, "inputRef" | "onFileChange" | "maxFileLabel">) => (
  <label
    htmlFor="cv-upload"
    className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800"
  >
    <span className="text-base font-medium text-slate-700 dark:text-slate-100">
      Drop your resume here
    </span>
    <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 dark:border-slate-600 dark:text-slate-300">
      or click to browse
    </span>
    <span className="text-xs text-slate-400 dark:text-slate-400">
      Max size: {maxFileLabel} MB • Approved types: PDF, DOCX
    </span>
    <input
      ref={inputRef}
      id="cv-upload"
      name="cv-upload"
      type="file"
      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      onChange={onFileChange}
      className="absolute inset-0 cursor-pointer opacity-0"
    />
  </label>
);

const UploadControls = ({ status, children }: Pick<UploadFormProps, "status"> & { children: ReactNode }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
      <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" aria-hidden />
      {children}
    </p>
    <button
      type="submit"
      className="inline-flex min-w-[140px] items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400"
      disabled={status === "uploading"}
    >
      {status === "uploading" ? "Uploading…" : "Save to CVs"}
    </button>
  </div>
);

const UploadStatusBanner = ({ statusMessage, hasError }: Pick<UploadFormProps, "statusMessage" | "hasError">) => {
  if (!statusMessage) {
    return null;
  }

  const tone = hasError
    ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200"
    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200";

  return (
    <p role="status" aria-live="polite" className={`rounded-2xl px-4 py-3 text-sm font-medium ${tone}`}>
      {statusMessage}
    </p>
  );
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
  <UploadFormSection>
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <UploadFormHeader />
      <UploadDropzone inputRef={inputRef} onFileChange={onFileChange} maxFileLabel={maxFileLabel} />
      <UploadControls status={status}>
        {status === "uploading" ? "Uploading to Cloudinary…" : "Ready when you are — PDFs and DOCX files only."}
      </UploadControls>
      <UploadStatusBanner statusMessage={statusMessage} hasError={hasError} />
    </form>
  </UploadFormSection>
);

const CvListShell = ({ children }: { children: ReactNode }) => (
  <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/40 backdrop-blur-sm transition dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-100">
    {children}
  </section>
);

const CvListHeader = () => (
  <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-300">
        Library
      </p>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My CVs</h2>
    </div>
    <Link
      href="/"
      className="text-sm font-medium text-blue-600 transition hover:text-blue-500 dark:text-blue-400"
    >
      Back to marketing site
    </Link>
  </header>
);

const CvListMessage = ({ tone, children }: { tone: "loading" | "error"; children: ReactNode }) => {
  const style =
    tone === "loading"
      ? "border border-dashed border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300"
      : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200";

  return (
    <p className={`mt-8 rounded-2xl px-4 py-6 text-center text-sm ${style}`}>
      {children}
    </p>
  );
};

const CvEmptyState = () => (
  <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      No uploads yet
    </span>
    <p>Add your first resume above to see metadata, file size, and Cloudinary IDs in this list.</p>
  </div>
);

const CvCard = ({ cv }: { cv: CvSummary }) => (
  <li className="group transform rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/60">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <a
        href={cv.fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-base font-semibold text-blue-700 transition group-hover:text-blue-600 dark:text-blue-300 dark:group-hover:text-blue-200"
      >
        {cv.fileName}
      </a>
      <span className="text-xs text-slate-500 dark:text-slate-300">{formatTimestamp(cv.uploadedAt)}</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
        {cv.mimeType}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
        {formatBytes(cv.fileSize)}
      </span>
      {cv.publicId ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
          Cloudinary ID: {cv.publicId}
        </span>
      ) : null}
    </div>
  </li>
);

const CvList = ({ cvs, fetchState }: CvListProps) => (
  <CvListShell>
    <CvListHeader />
    {fetchState === "loading" && (
      <CvListMessage tone="loading">Loading existing uploads…</CvListMessage>
    )}
    {fetchState === "error" && (
      <CvListMessage tone="error">We could not load your CVs. Please refresh to try again.</CvListMessage>
    )}
    {fetchState === "idle" && cvs.length === 0 && <CvEmptyState />}
    {cvs.length > 0 && (
      <ul className="mt-8 space-y-4">
        {cvs.map((cv) => (
          <CvCard key={cv.id} cv={cv} />
        ))}
      </ul>
    )}
  </CvListShell>
);

export default function DashboardPage() {
  const [cvs, setCvs] = useState<CvSummary[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [clientError, setClientError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { status, error: uploadError, upload, reset } = useUploadToCloudinary();
  const stats = useMemo(() => {
    const totalBytes = cvs.reduce((acc, cv) => acc + cv.fileSize, 0);
    return {
      count: cvs.length,
      totalBytes,
      totalLabel: formatBytes(totalBytes),
    };
  }, [cvs]);

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
    <div className="relative min-h-[80vh] w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-16 text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_55%)]" aria-hidden />
      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-10 px-2 sm:px-8">
        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
            Dashboard
          </p>
          <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-lg backdrop-blur dark:border-white/5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white">My CVs</h1>
                <p className="text-sm text-slate-200">
                  Upload resumes directly to Cloudinary using the unsigned preset. CVATS stores only
                  the resulting URL and metadata for downstream analysis.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-medium">
                <span className="rounded-full bg-white/20 px-4 py-2 text-white">
                  {stats.count} {stats.count === 1 ? "CV stored" : "CVs stored"}
                </span>
                <span className="rounded-full bg-white/10 px-4 py-2 text-white/90">
                  Total size {stats.totalLabel}
                </span>
              </div>
            </div>
          </div>
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
    </div>
  );
}
