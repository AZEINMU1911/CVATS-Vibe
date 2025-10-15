"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useUploadToCloudinary, type UploadStatus } from "@/hooks/use-upload-to-cloudinary";
import { validateFile } from "@/lib/validate-file";
import { useAnalyze } from "@/hooks/use-analyze";
import { useCvList } from "@/hooks/use-cv-list";
import Swal from "sweetalert2";
import { getActiveUserEmail } from "@/lib/auth-client";

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
  selectedFileName: string | null;
  selectedFileSize: number | null;
}

interface CvListProps {
  cvs: CvSummary[];
  fetchState: FetchState;
  nextCursor?: string | null;
  isLoadingMore: boolean;
  loadMore: () => Promise<void> | void;
  deleteCv: (id: string) => Promise<boolean>;
  errorMessage?: string | null;
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
  selectedFileName,
  selectedFileSize,
}: Pick<UploadFormProps, "inputRef" | "onFileChange" | "maxFileLabel" | "selectedFileName" | "selectedFileSize">) => (
  <label
    htmlFor="cv-upload"
    className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500 transition hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800"
  >
    <span className="text-base font-medium text-slate-700 dark:text-slate-100">
      {selectedFileName ? "Ready to upload" : "Drop your resume here"}
    </span>
    <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 dark:border-slate-600 dark:text-slate-300">
      {selectedFileName ? "Change file" : "or click to browse"}
    </span>
    <span className="text-xs text-slate-400 dark:text-slate-400">
      {selectedFileName
        ? `${selectedFileName}${selectedFileSize ? ` • ${formatBytes(selectedFileSize)}` : ""}`
        : `Max size: ${maxFileLabel} MB • Approved types: PDF, DOCX`}
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

const UploadControls = ({
  status,
  selectedFileName,
  selectedFileSize,
  maxFileLabel,
  children,
}: Pick<UploadFormProps, "status" | "maxFileLabel" | "selectedFileName" | "selectedFileSize"> & { children: ReactNode }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
      <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" aria-hidden />
      {children}
    </p>
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {selectedFileName ? (
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
          Selected: {selectedFileName}
          {selectedFileSize ? ` • ${formatBytes(selectedFileSize)}` : ""}
        </span>
      ) : (
        <span className="text-xs text-slate-400 dark:text-slate-400">Max size: {maxFileLabel} MB</span>
      )}
      <button
        type="submit"
        className="inline-flex min-w-[140px] items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400"
        disabled={status === "uploading" || !selectedFileName}
      >
        {status === "uploading" ? "Uploading…" : "Save to CVs"}
      </button>
    </div>
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
  selectedFileName,
  selectedFileSize,
}: UploadFormProps) => (
  <UploadFormSection>
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <UploadFormHeader />
      <UploadDropzone
        inputRef={inputRef}
        onFileChange={onFileChange}
        maxFileLabel={maxFileLabel}
        selectedFileName={selectedFileName}
        selectedFileSize={selectedFileSize ?? null}
      />
      <UploadControls
        status={status}
        selectedFileName={selectedFileName}
        selectedFileSize={selectedFileSize ?? null}
        maxFileLabel={maxFileLabel}
      >
        {status === "uploading"
          ? "Uploading to Cloudinary…"
          : selectedFileName
            ? "All set — click save to persist metadata."
            : "Ready when you are — PDFs and DOCX files only."}
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
  const role = tone === "error" ? "alert" : "status";
  const ariaLive = tone === "error" ? "assertive" : "polite";

  return (
    <p role={role} aria-live={ariaLive} className={`mt-8 rounded-2xl px-4 py-6 text-center text-sm ${style}`}>
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

const CvCard = ({ cv, onDelete }: { cv: CvSummary; onDelete: (id: string) => Promise<boolean> }) => {
  const { analyses, status, error, analyze } = useAnalyze(cv.id);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmButtonId = `delete-confirm-${cv.id}`;
  const cancelButtonId = `delete-cancel-${cv.id}`;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const deleted = await onDelete(cv.id);
      if (!deleted) {
        setShowConfirm(false);
        throw new Error("CV not found or already deleted.");
      }
      setShowConfirm(false);
    } catch (err) {
      console.error(err);
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <li className="group transform rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <a
            href={cv.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold text-blue-700 transition group-hover:text-blue-600 dark:text-blue-300 dark:group-hover:text-blue-200"
          >
            {cv.fileName}
          </a>
          <span className="text-xs text-slate-500 dark:text-slate-300">
            {formatTimestamp(cv.uploadedAt)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void analyze();
            }}
            disabled={status === "running" || isDeleting}
            className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {status === "running" ? "Analyzing…" : "Analyze"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={isDeleting || status === "running"}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
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
      {error ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {showConfirm ? (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={confirmButtonId}
          aria-describedby={cancelButtonId}
          className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-200"
        >
          <p className="font-semibold">Delete {cv.fileName}?</p>
          <p id={cancelButtonId} className="mt-1 text-[11px]">
            This removes the CV metadata permanently.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              id={confirmButtonId}
              type="button"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
            >
              {isDeleting ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {analyses.length > 0 ? (
        <div className="mt-4 space-y-3">
          {analyses.map((analysis) => (
            <div
              key={analysis.id}
              className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Score: {analysis.score ?? 0}</span>
                <span>{new Date(analysis.createdAt).toLocaleTimeString()}</span>
              </div>
              {analysis.message ? (
                <p className="mt-1 text-[11px] text-blue-700 dark:text-blue-200/80">{analysis.message}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.keywordsMatched.length > 0 ? (
                  analysis.keywordsMatched.map((keyword) => (
                    <span
                      key={keyword}
                      className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-400/20 dark:text-blue-100"
                    >
                      {keyword}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-blue-700 dark:text-blue-200/80">
                    No keywords matched.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
};

const CvList = ({
  cvs,
  fetchState,
  nextCursor,
  isLoadingMore,
  loadMore,
  deleteCv,
  errorMessage,
}: CvListProps) => (
  <CvListShell>
    <CvListHeader />
    {fetchState === "loading" && (
      <CvListMessage tone="loading">Loading existing uploads…</CvListMessage>
    )}
    {(fetchState === "error" || errorMessage) && (
      <CvListMessage tone="error">
        {errorMessage ?? "We could not load your CVs. Please refresh to try again."}
      </CvListMessage>
    )}
    {fetchState === "idle" && cvs.length === 0 && <CvEmptyState />}
    {cvs.length > 0 && (
      <>
        <ul className="mt-8 space-y-4">
          {cvs.map((cv) => (
            <CvCard key={cv.id} cv={cv} onDelete={deleteCv} />
          ))}
        </ul>
        {nextCursor ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
              onClick={() => {
                void loadMore();
              }}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </>
    )}
  </CvListShell>
);

export default function DashboardPage() {
  const { cvs, fetchState, nextCursor, isLoadingMore, loadMore, deleteCv, refresh, error } =
    useCvList();
  const [clientError, setClientError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFileInfo, setSelectedFileInfo] = useState<{ name: string; size: number } | null>(
    null,
  );
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

  const handleFileChange = useCallback(() => {
    setClientError(null);
    setSuccessMessage(null);
    reset();
    const file = fileInputRef.current?.files?.[0] ?? null;
    if (file) {
      setSelectedFileInfo({ name: file.name, size: file.size });
    } else {
      setSelectedFileInfo(null);
    }
  }, [reset]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setClientError(null);
      setSuccessMessage(null);

      const file = fileInputRef.current?.files?.[0];
      if (!file) {
        setClientError("Please choose a PDF or DOCX file before uploading.");
        setSelectedFileInfo(null);
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
        setSelectedFileInfo(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      try {
        const cloudinary = await upload(file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-email": getActiveUserEmail(),
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
        void refresh({ prepend: payload.cv });
        setSuccessMessage(`Uploaded ${payload.cv.fileName}.`);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setSelectedFileInfo(null);
        void Swal.fire({
          title: "Upload successful",
          text: `${payload.cv.fileName} is ready for analysis.`,
          icon: "success",
          timer: 1600,
          showConfirmButton: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unexpected upload failure.";
        setClientError(message);
      }
    },
    [refresh, upload],
  );

  const statusMessage = useMemo(
    () => statusLabel(status, successMessage, clientError ?? uploadError),
    [status, successMessage, clientError, uploadError],
  );

  const maxFileLabel = process.env.NEXT_PUBLIC_MAX_FILE_MB ?? "8";
  const selectedFileName = selectedFileInfo?.name ?? null;
  const selectedFileSize = selectedFileInfo?.size ?? null;

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
          selectedFileName={selectedFileName}
          selectedFileSize={selectedFileSize}
        />

      <CvList
        cvs={cvs}
        fetchState={fetchState}
        nextCursor={nextCursor ?? null}
        isLoadingMore={isLoadingMore}
        loadMore={loadMore}
        deleteCv={deleteCv}
        errorMessage={error}
      />
      </main>
    </div>
  );
}
