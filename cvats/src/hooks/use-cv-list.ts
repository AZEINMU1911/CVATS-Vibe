import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";

export interface CvListItem {
  id: string;
  userId?: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  publicId?: string | null;
}

interface FetchResult {
  cvs?: CvListItem[];
  nextCursor?: string | null;
  error?: string;
}

type FetchState = "idle" | "loading" | "error";

interface RefreshOptions {
  prepend?: CvListItem;
}

const PAGE_SIZE = 10;

export const useCvList = () => {
  const [items, setItems] = useState<CvListItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const loadPage = useCallback(
    async (cursor?: string | null, options?: RefreshOptions) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) {
        params.set("cursor", cursor);
      }

      const response = await fetch(`/api/uploads?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load CVs");
      }

      const data = (await response.json()) as FetchResult;
      setItems((current) => {
        const incoming = data.cvs ?? [];
        if (cursor) {
          return [...current, ...incoming];
        }

        const prepended = options?.prepend ? [options.prepend, ...incoming] : incoming;
        return prepended.filter((item, index, arr) => arr.findIndex((cv) => cv.id === item.id) === index);
      });
      setNextCursor(data.nextCursor ?? null);
      setError(null);
    },
    [],
  );

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      setFetchState("loading");
      try {
        await loadPage(undefined, options);
        setFetchState("idle");
      } catch (err) {
        console.error(err);
        setFetchState("error");
        setError(err instanceof Error ? err.message : "Failed to load CVs");
      }
    },
    [loadPage],
  );

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      void refresh();
    }
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      await loadPage(nextCursor);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load CVs");
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, loadPage, nextCursor]);

  const deleteCv = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/uploads?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        setItems((current) => current.filter((item) => item.id !== id));
        void Swal.fire({
          title: "CV deleted",
          text: "The resume metadata has been removed.",
          icon: "success",
          confirmButtonText: "OK",
          timer: 1500,
          showConfirmButton: false,
        });
        return true;
      }
      if (response.status === 404) {
        return false;
      }
      throw new Error("Failed to delete CV");
    },
    [],
  );

  return useMemo(
    () => ({
      cvs: items,
      fetchState,
      nextCursor,
      isLoadingMore,
      error,
      refresh,
      loadMore,
      deleteCv,
    }),
    [deleteCv, error, fetchState, isLoadingMore, items, loadMore, nextCursor, refresh],
  );
};
