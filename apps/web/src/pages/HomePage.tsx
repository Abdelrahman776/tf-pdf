import { useMutation, useQuery } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createJob,
  getHealth,
  getProvidersStatus,
  InputMode,
  JobResponse,
  uploadFile,
} from "../api";

export function HomePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("scanned_pdf");
  const [language, setLanguage] = useState("en");
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [userPrompt, setUserPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) {
        throw new Error("Please choose a file first");
      }
      const uploaded = await uploadFile(file);
      return createJob({
        file_id: uploaded.file_id,
        mode,
        preserve_layout: preserveLayout,
        language,
        user_prompt: userPrompt || undefined,
      });
    },
    onSuccess: (job: JobResponse) => navigate(`/jobs/${job.id}`),
  });

  const healthMutation = useMutation({
    mutationFn: getHealth,
  });

  const providersQuery = useQuery({
    queryKey: ["providers-status"],
    queryFn: getProvidersStatus,
    refetchInterval: 15000,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <section className="card">
      <h2>Upload document</h2>
      <p>
        Convert scanned PDF, images, and handwritten notes into searchable
        digital PDF.
      </p>

      <form onSubmit={onSubmit} className="form-grid">
        <div className="health-row">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => healthMutation.mutate()}
            disabled={healthMutation.isPending}
          >
            {healthMutation.isPending ? "Checking..." : "Run API health check"}
          </button>
          {healthMutation.data ? (
            <span className="ok">API: {healthMutation.data.status}</span>
          ) : null}
          {healthMutation.error ? (
            <span className="error">
              {(healthMutation.error as Error).message}
            </span>
          ) : null}
        </div>

        <div className="providers-box">
          <div className="providers-head">
            <b>OCR/VLM providers</b>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => providersQuery.refetch()}
            >
              Refresh providers
            </button>
          </div>
          {providersQuery.isLoading ? <p>Loading providers...</p> : null}
          {providersQuery.error ? (
            <p className="error">{(providersQuery.error as Error).message}</p>
          ) : null}
          {providersQuery.data ? (
            <>
              <p className="muted">
                Order: {providersQuery.data.order.join(" -> ")}
              </p>
              <div className="providers-grid">
                {Object.entries(providersQuery.data.configured).map(
                  ([name, isConfigured]) => (
                    <span
                      key={name}
                      className={isConfigured ? "provider on" : "provider off"}
                    >
                      {name}: {isConfigured ? "configured" : "missing"}
                    </span>
                  ),
                )}
              </div>
            </>
          ) : null}
        </div>

        <label>
          File
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFile(e.target.files?.[0] ?? null)
            }
          />
        </label>

        <label>
          Input mode
          <select
            value={mode}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setMode(e.target.value as InputMode)
            }
          >
            <option value="scanned_pdf">Scanned PDF</option>
            <option value="image">Image</option>
            <option value="handwriting">Handwriting</option>
          </select>
        </label>

        <label>
          Language
          <select
            value={language}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setLanguage(e.target.value)
            }
          >
            <option value="en">English</option>
            <option value="ar">Arabic (roadmap)</option>
          </select>
        </label>

        <label className="inline">
          <input
            type="checkbox"
            checked={preserveLayout}
            onChange={(e) => setPreserveLayout(e.target.checked)}
          />
          Preserve original layout
        </label>

        <label>
          Optional instruction
          <textarea
            rows={3}
            value={userPrompt}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setUserPrompt(e.target.value)
            }
            placeholder="Example: keep heading style, improve readability"
          />
        </label>

        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Starting..." : "Convert"}
        </button>

        {mutation.error ? (
          <p className="error">{(mutation.error as Error).message}</p>
        ) : null}
      </form>
    </section>
  );
}
