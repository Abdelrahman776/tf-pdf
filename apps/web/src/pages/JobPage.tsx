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
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [userPrompt, setUserPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

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
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      const nextPreviewUrl = URL.createObjectURL(file);
      setCurrentUpload(uploaded);
      setPreviewUrl(nextPreviewUrl);
      setFileName(file.name);
      setContentType(file.type || uploaded.content_type);
      setPreviewTab("original");
      setPhase("before");

      if (activeJobId) {
        navigate(`/jobs/new`, {
          replace: true,
          state: buildJobState(
            uploaded,
            nextPreviewUrl,
            file.name,
            file.type || uploaded.content_type,
          ),
        });
      }
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
        language: languages.join(","),
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
    mutationFn: () => patchPage(activeJobId!, 1, instruction),
    onSuccess: () => {
      setInstruction("");
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

  /* --- Handlers ---------------------------------------------------- */
  const handleReUpload = (file: File) => {
    const validExts = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!validExts.has(ext)) {
      alert("Please upload a PDF, JPG, PNG, or WEBP file.");
      return;
    }
    reUploadMutation.mutate(file);
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
    handleReUpload(droppedFile);
  };

  const onConvert = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const onPatch = (e: FormEvent) => {
    e.preventDefault();
    if (!instruction.trim()) return;
    patchMutation.mutate();
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <section className="job-page">
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
                  if (e.target.files?.[0]) handleReUpload(e.target.files[0]);
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
                <span>Language (select one or more)</span>
                <select
                  className="job-select"
                  multiple
                  value={languages}
                  onChange={(e) =>
                    setLanguages(
                      Array.from(e.target.selectedOptions, (option) => option.value),
                    )
                  }
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                  <option value="it">Italian</option>
                </select>
                <span className="job-help-text">
                  Hold Ctrl (Windows) to select multiple languages.
                </span>
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
                disabled={createMutation.isPending || !currentUpload}
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
                  <div className="flex items-center justify-between mb-1">
                    <StatusBadge status={job.status} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {job.progress}%
                    </span>
                  </div>
                  <ProgressBar value={job.progress} />
                </div>

                {/* Timeline (always visible as part of progress) */}
                <div className="job-timeline-section">
                  <h4 className="job-mini-heading">Processing Timeline</h4>
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
                </div>

                {/* Chat / edit instruction */}
                <form onSubmit={onPatch} className="job-edit-form">
                  <h4 className="job-mini-heading">Edit / Refine</h4>
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
                </form>

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
      <div className="card job-card">
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
            disabled={!activeJobId}
          >
            Result
          </button>
        </div>

        {/* Original preview */}
        {previewTab === "original" && (
          <OriginalPreview
            previewUrl={previewUrl}
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
                <iframe
                  title="result"
                  className="pdf-frame"
                  src={resultUrl(activeJobId)}
                />
                <div className="mt-3 flex gap-2">
                  <a
                    className="job-btn job-btn--primary inline-flex"
                    href={resultUrl(activeJobId)}
                    download={`trueform-${activeJobId}.pdf`}
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </a>
                  <button
                    type="button"
                    className="job-btn job-btn--secondary"
                    onClick={() => {
                      setPhase("before");
                      setPreviewTab("original");
                    }}
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
