import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DragEvent, FormEvent, ReactNode, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createJob,
  getJob,
  getJobEvents,
  getLayoutArtifact,
  InputMode,
  JobResponse,
  patchPage,
  resultUrl,
  uploadedFileContentUrl,
  uploadFile,
  UploadResponse,
} from "../api.ts";
import {
  Upload,
  Settings,
  Play,
  ChevronDown,
  ChevronRight,
  Send,
  Download,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type JobSetupState = {
  uploaded?: UploadResponse;
  localPreviewUrl?: string;
  filename?: string;
  contentType?: string;
};

type WorkflowPhase = "before" | "after";
type PreviewTab = "original" | "result";

function withCacheBuster(url: string, token?: string): string {
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(token)}`;
}

function parsePatchPageTargets(spec: string, availablePages: number[]): number[] {
  const normalized = spec.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Enter pages to edit (for example: 1, 3-5, or all).");
  }

  const availableSet = new Set(availablePages);
  const hasAvailablePages = availablePages.length > 0;

  if (normalized === "all") {
    if (!hasAvailablePages) {
      throw new Error("Cannot use 'all' until job pages are available.");
    }
    return [...availablePages].sort((a, b) => a - b);
  }

  const tokens = normalized.split(",").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("Enter pages to edit (for example: 1, 3-5, or all).");
  }

  const selected = new Set<number>();
  for (const token of tokens) {
    if (token === "all") {
      throw new Error("Use either 'all' or specific pages, not both.");
    }

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1 || end < start) {
        throw new Error(`Invalid range: ${token}`);
      }
      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        selected.add(pageNumber);
      }
      continue;
    }

    if (/^\d+$/.test(token)) {
      const pageNumber = Number(token);
      if (pageNumber < 1) {
        throw new Error(`Invalid page number: ${token}`);
      }
      selected.add(pageNumber);
      continue;
    }

    throw new Error(`Invalid page selector: ${token}`);
  }

  const parsed = [...selected].sort((a, b) => a - b);
  if (hasAvailablePages) {
    const invalidPage = parsed.find((pageNumber) => !availableSet.has(pageNumber));
    if (invalidPage) {
      throw new Error(`Page ${invalidPage} is not available for this job.`);
    }
  }

  return parsed;
}

/* ------------------------------------------------------------------ */
/*  Small reusable pieces                                              */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: ReactNode }> = {
    completed: {
      cls: "job-badge job-badge--success",
      icon: <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />,
    },
    failed: {
      cls: "job-badge job-badge--error",
      icon: <XCircle className="inline h-3.5 w-3.5 mr-1" />,
    },
    processing: {
      cls: "job-badge job-badge--processing",
      icon: <Loader2 className="inline h-3.5 w-3.5 mr-1 animate-spin" />,
    },
  };
  const entry = map[status] ?? {
    cls: "job-badge job-badge--pending",
    icon: <Clock className="inline h-3.5 w-3.5 mr-1" />,
  };
  return (
    <span className={entry.cls}>
      {entry.icon}
      {status}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="job-progress-track">
      <div
        className="job-progress-fill"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="job-disclosure">
      <button
        type="button"
        className="job-disclosure-btn"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{label}</span>
      </button>
      {open && <div className="job-disclosure-body">{children}</div>}
    </div>
  );
}

function OriginalPreview({
  previewUrl,
  contentType,
  fallbackName,
}: {
  previewUrl?: string;
  contentType?: string;
  fallbackName?: string;
}) {
  if (!previewUrl) {
    return (
      <div className="job-empty-preview">
        <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="muted">
          Preview unavailable.
          {fallbackName ? ` File: ${fallbackName}` : ""}
        </p>
      </div>
    );
  }
  if (contentType?.startsWith("image/")) {
    return <img src={previewUrl} alt="Original upload" className="job-preview-img" />;
  }
  return <iframe title="original-file" className="pdf-frame" src={previewUrl} />;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function JobPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { jobId: routeJobId } = useParams<{ jobId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPreviewUrlRef = useRef<string | undefined>(undefined);

  /* --- Incoming state from Hero upload ----------------------------- */
  const incomingState = (location.state as JobSetupState | null) ?? null;
  const setupParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const setupUploadFromParams = useMemo<UploadResponse | null>(() => {
    const fileId = setupParams.get("file_id");
    if (!fileId) return null;
    return {
      file_id: fileId,
      filename: setupParams.get("filename") ?? "uploaded-file",
      content_type: setupParams.get("content_type") ?? "application/octet-stream",
      size_bytes: 0,
    };
  }, [setupParams]);

  /* --- Local state ------------------------------------------------- */
  const [currentUpload, setCurrentUpload] = useState<UploadResponse | null>(
    incomingState?.uploaded ?? setupUploadFromParams,
  );
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    incomingState?.localPreviewUrl,
  );
  const [fileName, setFileName] = useState<string | undefined>(
    incomingState?.filename ??
      incomingState?.uploaded?.filename ??
      setupUploadFromParams?.filename,
  );
  const [contentType, setContentType] = useState<string | undefined>(
    incomingState?.contentType ??
      incomingState?.uploaded?.content_type ??
      setupUploadFromParams?.content_type,
  );

  const [mode, setMode] = useState<InputMode>("scanned_pdf");
  const [language, setLanguage] = useState("en");
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [userPrompt, setUserPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [patchPageTargets, setPatchPageTargets] = useState("1");
  const [patchPageTargetsError, setPatchPageTargetsError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isDownloadingResult, setIsDownloadingResult] = useState(false);

  const [phase, setPhase] = useState<WorkflowPhase>(routeJobId ? "after" : "before");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("original");

  const activeJobId = useMemo(() => routeJobId ?? null, [routeJobId]);

  const buildJobState = (
    uploaded: UploadResponse | null,
    nextPreviewUrl?: string,
    nextFileName?: string,
    nextContentType?: string,
  ): JobSetupState | undefined => {
    if (!uploaded) return undefined;
    return {
      uploaded,
      localPreviewUrl: nextPreviewUrl,
      filename: nextFileName,
      contentType: nextContentType,
    };
  };

  /* --- Queries & mutations ---------------------------------------- */
  const jobQuery = useQuery({
    queryKey: ["job", activeJobId],
    queryFn: () => getJob(activeJobId!),
    enabled: Boolean(activeJobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || s === "completed" || s === "failed") return false;
      return 1500;
    },
  });

  const reUploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: (uploaded, file) => {
      const nextPreviewUrl = pendingPreviewUrlRef.current;
      const nextContentType = file.type || uploaded.content_type;
      setCurrentUpload(uploaded);
      if (nextPreviewUrl) {
        setPreviewUrl(nextPreviewUrl);
      }
      setFileName(file.name);
      setContentType(nextContentType);
      setPreviewTab("original");
      setPhase("before");
      pendingPreviewUrlRef.current = undefined;

      const params = new URLSearchParams({
        file_id: uploaded.file_id,
        filename: file.name,
        content_type: nextContentType,
      });

      navigate(`/jobs/new?${params.toString()}`, {
        replace: true,
        state: buildJobState(
          uploaded,
          nextPreviewUrl ?? previewUrl,
          file.name,
          nextContentType,
        ),
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const fileId = currentUpload?.file_id;
      if (!fileId) throw new Error("No file uploaded yet.");
      return createJob({
        file_id: fileId,
        mode,
        preserve_layout: preserveLayout,
        language,
        user_prompt: userPrompt || undefined,
      });
    },
    onSuccess: (job: JobResponse) => {
      queryClient.setQueryData(["job", job.id], job);
      setPhase("after");
      setPreviewTab("result");
      navigate(`/jobs/${job.id}`, {
        replace: true,
        state: buildJobState(currentUpload, previewUrl, fileName, contentType),
      });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({
      nextInstruction,
      pageNumbers,
    }: {
      nextInstruction: string;
      pageNumbers: number[];
    }) => {
      if (!activeJobId) throw new Error("No active job selected.");
      let latest: JobResponse | null = null;
      for (const pageNumber of pageNumbers) {
        latest = await patchPage(activeJobId, pageNumber, nextInstruction);
      }
      if (!latest) {
        throw new Error("No page updates were applied.");
      }
      return latest;
    },
    onSuccess: (updatedJob) => {
      setInstruction("");
      setPatchPageTargetsError(null);
      queryClient.setQueryData(["job", activeJobId], updatedJob);
      queryClient.invalidateQueries({ queryKey: ["job", activeJobId] });
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["job-events", activeJobId],
    queryFn: () => getJobEvents(activeJobId!),
    enabled: Boolean(activeJobId),
    refetchInterval: () => {
      const status = jobQuery.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1500;
    },
  });

  const artifactQuery = useQuery({
    queryKey: ["job-layout-artifact", activeJobId],
    queryFn: () => getLayoutArtifact(activeJobId!),
    enabled: Boolean(activeJobId) && jobQuery.data?.status === "completed",
    retry: false,
  });

  const job = jobQuery.data;
  const persistedFileId = currentUpload?.file_id ?? job?.file_id;
  const originalPreviewCacheToken = useMemo(() => {
    if (!persistedFileId) return undefined;
    return `${persistedFileId}-${fileName ?? ""}`;
  }, [persistedFileId, fileName]);
  const resultPreviewCacheToken = useMemo(() => {
    if (!activeJobId) return undefined;
    const artifactPages = artifactQuery.data?.pages ?? [];
    const pageToken = artifactPages
      .map((page) => page.page_number)
      .filter((num): num is number => Number.isInteger(num) && num > 0)
      .join("-");
    return `${activeJobId}-${pageToken}`;
  }, [activeJobId, artifactQuery.data?.pages]);
  const originalPreviewUrl = useMemo(() => {
    const hasBlobPreview = Boolean(previewUrl?.startsWith("blob:"));
    if (persistedFileId) {
      return withCacheBuster(
        uploadedFileContentUrl(persistedFileId),
        originalPreviewCacheToken,
      );
    }
    if (hasBlobPreview) return previewUrl;
    if (previewUrl) return previewUrl;
    return undefined;
  }, [originalPreviewCacheToken, persistedFileId, previewUrl]);
  const resultDownloadFilename = useMemo(() => {
    const sourceName = fileName ?? currentUpload?.filename ?? "result";
    const extensionIndex = sourceName.lastIndexOf(".");
    const baseName = extensionIndex > 0 ? sourceName.slice(0, extensionIndex) : sourceName;
    return `${baseName}_tfpdf.pdf`;
  }, [currentUpload?.filename, fileName]);
  const patchablePageNumbers = useMemo(
    () =>
      (job?.pages ?? [])
        .map((page) => page.page_number)
        .filter((num): num is number => Number.isInteger(num) && num > 0),
    [job?.pages],
  );

  /* --- Handlers ---------------------------------------------------- */
  const handleFileInput = (selectedFile: File) => {
    const validTypes = new Set([
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    const validExtensions = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
    const extension = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
    const loweredType = selectedFile.type.toLowerCase();
    const isAcceptedType = loweredType ? validTypes.has(loweredType) : false;
    const isAcceptedExtension = validExtensions.has(extension);

    if (!isAcceptedType && !isAcceptedExtension) {
      alert("Please upload a PDF, JPG, PNG, or WEBP file.");
      return;
    }

    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    pendingPreviewUrlRef.current = nextPreviewUrl;

    navigate("/jobs/new", {
      replace: true,
      state: {
        localPreviewUrl: nextPreviewUrl,
        filename: selectedFile.name,
        contentType: selectedFile.type,
      } satisfies JobSetupState,
    });

    setMode("scanned_pdf");
    setLanguage("en");
    setPreserveLayout(true);
    setUserPrompt("");
    setInstruction("");
    setPatchPageTargets("1");
    setPatchPageTargetsError(null);
    createMutation.reset();
    patchMutation.reset();
    setCurrentUpload(null);
    setPreviewUrl(nextPreviewUrl);
    setFileName(selectedFile.name);
    setContentType(selectedFile.type || contentType);
    setPreviewTab("original");
    setPhase("before");

    reUploadMutation.mutate(selectedFile, {
      onError: () => {
        pendingPreviewUrlRef.current = undefined;
      },
    });
  };

  const onUploadZoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const onUploadZoneDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const onUploadZoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (!droppedFile) return;
    handleFileInput(droppedFile);
  };

  const onConvert = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const onPatch = (e: FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;

    try {
      const pageNumbers = parsePatchPageTargets(patchPageTargets, patchablePageNumbers);
      setPatchPageTargetsError(null);
      patchMutation.mutate({
        nextInstruction: instruction.trim(),
        pageNumbers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid page selector.";
      setPatchPageTargetsError(message);
    }
  };

  const onDownloadResult = async () => {
    if (!activeJobId || isDownloadingResult) return;
    setIsDownloadingResult(true);
    try {
      const response = await fetch(
        withCacheBuster(resultUrl(activeJobId), resultPreviewCacheToken ?? activeJobId),
      );
      if (!response.ok) {
        throw new Error("Failed to download result PDF.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = resultDownloadFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed.";
      alert(message);
    } finally {
      setIsDownloadingResult(false);
    }
  };

  const onResetForNewConversion = () => {
    const uploadForReset =
      currentUpload ??
      (job
        ? {
            file_id: job.file_id,
            filename: fileName ?? "uploaded-file",
            content_type: contentType ?? "application/octet-stream",
            size_bytes: 0,
          }
        : null);

    setMode("scanned_pdf");
    setLanguage("en");
    setPreserveLayout(true);
    setUserPrompt("");
    setInstruction("");
    setPatchPageTargets("1");
    setPatchPageTargetsError(null);
    setPhase("before");
    setPreviewTab("original");

    if (!uploadForReset) {
      setCurrentUpload(null);
      navigate("/jobs/new", { replace: true, state: undefined });
      return;
    }

    const nextFileName = fileName ?? uploadForReset.filename;
    const nextContentType = contentType ?? uploadForReset.content_type;
    setCurrentUpload(uploadForReset);
    setFileName(nextFileName);
    setContentType(nextContentType);

    const params = new URLSearchParams({
      file_id: uploadForReset.file_id,
      filename: nextFileName,
      content_type: nextContentType,
    });

    navigate(`/jobs/new?${params.toString()}`, {
      replace: true,
      state: buildJobState(uploadForReset, previewUrl, nextFileName, nextContentType),
    });
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <section className="job-page ">
      {/* ============ LEFT COLUMN — Controls ======================== */}
      <div className="card job-card">
        {/* Phase toggle tabs */}
        <div className="job-phase-tabs">
          <button
            type="button"
            className={`job-phase-tab ${phase === "before" ? "job-phase-tab--active" : ""}`}
            onClick={() => setPhase("before")}
          >
            <Settings className="h-4 w-4" />
            <span>Before</span>
          </button>
          <button
            type="button"
            className={`job-phase-tab ${phase === "after" ? "job-phase-tab--active" : ""}`}
            onClick={() => setPhase("after")}
            disabled={!activeJobId}
          >
            <Play className="h-4 w-4" />
            <span>After</span>
          </button>
        </div>

        {/* -------- BEFORE phase ------------------------------------ */}
        {phase === "before" && (
          <div className="job-section">
            {/* Re-upload area */}
            <div
              className={`job-upload-zone ${isDragActive ? "job-upload-zone--drag" : ""}`}
              onDragOver={onUploadZoneDragOver}
              onDragEnter={onUploadZoneDragOver}
              onDragLeave={onUploadZoneDragLeave}
              onDrop={onUploadZoneDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileInput(e.target.files[0]);
                }}
              />

              {fileName && (
                <div className="job-current-file">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
              )}

              <button
                type="button"
                className="job-btn job-btn--secondary w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={reUploadMutation.isPending}
              >
                {reUploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {currentUpload ? "Change file" : "Upload file"}
                  </>
                )}
              </button>
              <p className="job-upload-hint">
                Drag & drop a PDF or image here, or click to upload
              </p>

              {reUploadMutation.isError && (
                <p className="error text-sm mt-1">
                  {(reUploadMutation.error as Error).message}
                </p>
              )}
            </div>

            {/* Settings form */}
            <form onSubmit={onConvert} className="job-settings-form">
              <h3 className="job-section-title">Conversion Settings</h3>

              {/* Input Mode */}
              <label className="job-label">
                <span>Input Mode</span>
                <select
                  className="job-select"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as InputMode)}
                >
                  <option value="scanned_pdf">Scanned Document</option>
                  <option value="handwriting">Handwritten Document</option>
                </select>
              </label>

              {/* Language */}
              <label className="job-label">
                <span>Language</span>
                <select
                  className="job-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="it">Italian</option>
                </select>
              </label>

              {/* Preserve layout */}
              <label className="job-checkbox-label">
                <input
                  type="checkbox"
                  checked={preserveLayout}
                  onChange={(e) => setPreserveLayout(e.target.checked)}
                />
                <span>Preserve original layout</span>
              </label>

              {/* User prompt */}
              <label className="job-label">
                <span>Optional Instruction</span>
                <textarea
                  className="job-textarea"
                  rows={3}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="e.g. keep heading style, improve readability"
                />
              </label>

              {/* Convert button */}
              <button
                type="submit"
                className="job-btn job-btn--primary w-full"
                disabled={createMutation.isPending || reUploadMutation.isPending || !currentUpload}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Converting…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Convert File
                  </>
                )}
              </button>

              {createMutation.isError && (
                <p className="error text-sm">
                  {(createMutation.error as Error).message}
                </p>
              )}
            </form>
          </div>
        )}

        {/* -------- AFTER phase ------------------------------------- */}
        {phase === "after" && activeJobId && (
          <div className="job-section">
            {jobQuery.isLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading job…
              </div>
            )}

            {jobQuery.isError && (
              <p className="error text-sm">{(jobQuery.error as Error).message}</p>
            )}

            {job && (
              <>
                {/* Status + progress */}
                <div className="job-status-block">
                  <h4 className="job-mini-heading">Processing Timeline</h4>
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={job.status} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {job.progress}%
                    </span>
                  </div>
                  <ProgressBar value={job.progress} />
                </div>

                {/* Chat / edit instruction */}
                <form onSubmit={onPatch} className="job-edit-form">
                  <h4 className="job-mini-heading">Edit / Refine</h4>
                  <label className="job-label">
                    <span>Pages to edit</span>
                    <input
                      className="job-select"
                      value={patchPageTargets}
                      onChange={(e) => {
                        setPatchPageTargets(e.target.value);
                        if (patchPageTargetsError) setPatchPageTargetsError(null);
                      }}
                      placeholder="all, 1,3,5-7"
                    />
                  </label>
                  <p className="muted text-xs">Use all, comma-separated pages, or ranges like 2-5.</p>
                  <textarea
                    className="job-textarea"
                    rows={2}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Fix typo in title, make body text clearer"
                  />
                  <button
                    type="submit"
                    className="job-btn job-btn--primary w-full"
                    disabled={patchMutation.isPending || !instruction.trim()}
                  >
                    {patchMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Applying…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Apply Edit
                      </>
                    )}
                  </button>
                  {patchMutation.isError && (
                    <p className="error text-sm">
                      {(patchMutation.error as Error).message}
                    </p>
                  )}
                  {patchPageTargetsError && <p className="error text-sm">{patchPageTargetsError}</p>}
                </form>

                <Disclosure label="Processing Timeline">
                  <div className="timeline">
                    {(eventsQuery.data ?? []).length === 0 ? (
                      <div className="timeline-item">
                        <span className="muted">Waiting for events…</span>
                      </div>
                    ) : (
                      (eventsQuery.data ?? []).map((event, i) => (
                        <div className="timeline-item" key={`${event.at}-${i}`}>
                          <div className="timeline-time">
                            {new Date(event.at).toLocaleTimeString()}
                          </div>
                          <div className="timeline-text">
                            <b>{event.status}</b> — {event.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Disclosure>

                {/* Hidden-by-default previews */}
                <Disclosure label="Page JSON Preview">
                  <pre className="job-pre">
                    {JSON.stringify(job.pages[0] ?? {}, null, 2)}
                  </pre>
                </Disclosure>

                <Disclosure label="Layout Artifact Preview">
                  {artifactQuery.isLoading && (
                    <p className="muted text-sm">Loading artifacts…</p>
                  )}
                  {artifactQuery.isError && (
                    <p className="muted text-sm">No layout artifact available.</p>
                  )}
                  {artifactQuery.data && (
                    <>
                      <pre className="job-pre">
                        {JSON.stringify(
                          artifactQuery.data.pages[0]?.layout ?? {},
                          null,
                          2,
                        )}
                      </pre>
                      <div className="crop-grid">
                        {(artifactQuery.data.pages ?? []).flatMap((page) =>
                          (page.image_blocks ?? []).map((block) => {
                            const imageUrl = String(block.style?.image_url ?? "");
                            if (!imageUrl) return null;
                            return (
                              <div
                                className="crop-card"
                                key={`${page.page_number}-${block.id}`}
                              >
                                <img
                                  src={imageUrl}
                                  className="crop-thumb"
                                  alt={`page-${page.page_number}-${block.id}`}
                                />
                                <div className="muted text-xs mt-1">
                                  Page {page.page_number}
                                </div>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    </>
                  )}
                </Disclosure>
              </>
            )}
          </div>
        )}
      </div>

      {/* ============ RIGHT COLUMN — File Preview =================== */}
      <div className="card job-card ">
        {/* Preview tab toggle */}
        <div className="job-preview-tabs">
          <button
            type="button"
            className={`job-preview-tab ${previewTab === "original" ? "job-preview-tab--active" : ""}`}
            onClick={() => setPreviewTab("original")}
          >
            Original
          </button>
          <button
            type="button"
            className={`job-preview-tab ${previewTab === "result" ? "job-preview-tab--active" : ""}`}
            onClick={() => setPreviewTab("result")}
            disabled={!activeJobId || phase === "before" || reUploadMutation.isPending}
          >
            Result
          </button>
        </div>

        {/* Original preview */}
        {previewTab === "original" && (
          <OriginalPreview
            previewUrl={originalPreviewUrl}
            contentType={contentType}
            fallbackName={fileName}
          />
        )}

        {/* Result preview */}
        {previewTab === "result" && (
          <>
            {!activeJobId ? (
              <div className="job-empty-preview">
                <p className="muted">Convert the file first to see the result.</p>
              </div>
            ) : job?.status === "completed" ? (
              <div>
                <p className="job-result-filename muted">{resultDownloadFilename}</p>
                <div className="job-result-preview-window">
                  <iframe
                    title="result"
                    className="pdf-frame job-result-frame"
                    src={withCacheBuster(resultUrl(activeJobId), resultPreviewCacheToken ?? activeJobId)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="job-btn job-btn--primary inline-flex"
                    onClick={onDownloadResult}
                    disabled={isDownloadingResult}
                  >
                    {isDownloadingResult ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading…
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download PDF
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="job-btn job-btn--secondary"
                    onClick={onResetForNewConversion}
                  >
                    <RefreshCw className="h-4 w-4" />
                    New Conversion
                  </button>
                </div>
              </div>
            ) : (
              <div className="job-empty-preview">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-2" />
                <p className="muted">
                  Result not ready — status: <b>{job?.status ?? "pending"}</b>
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
