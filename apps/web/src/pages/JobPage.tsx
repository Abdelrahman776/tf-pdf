import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getJob,
  getJobEvents,
  getLayoutArtifact,
  patchPage,
  resultUrl,
} from "../api";

export function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || status === "completed" || status === "failed")
        return false;
      return 1500;
    },
  });

  const patchMutation = useMutation({
    mutationFn: () => patchPage(jobId!, 1, instruction),
    onSuccess: () => {
      setInstruction("");
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["job-events", jobId],
    queryFn: () => getJobEvents(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: 1500,
  });

  const artifactQuery = useQuery({
    queryKey: ["job-layout-artifact", jobId],
    queryFn: () => getLayoutArtifact(jobId!),
    enabled: Boolean(jobId) && jobQuery.data?.status === "completed",
    retry: false,
  });

  if (!jobId) return <p>Invalid job.</p>;
  if (jobQuery.isLoading) return <p>Loading...</p>;
  if (jobQuery.error)
    return <p className="error">{(jobQuery.error as Error).message}</p>;

  const job = jobQuery.data!;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!instruction.trim()) return;
    patchMutation.mutate();
  };

  return (
    <section className="result-grid">
      <div className="card">
        <h2>Conversion job</h2>
        <p>
          Status: <b>{job.status}</b>
        </p>
        <p>Progress: {job.progress}%</p>
        <p>Message: {job.message}</p>

        <h3>Page JSON preview</h3>
        <pre>{JSON.stringify(job.pages[0] ?? {}, null, 2)}</pre>

        <form onSubmit={onSubmit} className="form-grid">
          <label>
            Chat / edit instruction
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Fix typo in title, make body text clearer"
            />
          </label>
          <button type="submit" disabled={patchMutation.isPending}>
            Apply edit
          </button>
          {patchMutation.error ? (
            <p className="error">{(patchMutation.error as Error).message}</p>
          ) : null}
        </form>

        <h3>Processing timeline</h3>
        <div className="timeline">
          {(eventsQuery.data ?? []).map((event, index) => (
            <div className="timeline-item" key={`${event.at}-${index}`}>
              <div className="timeline-time">
                {new Date(event.at).toLocaleTimeString()}
              </div>
              <div className="timeline-text">
                <b>{event.status}</b> - {event.message}
              </div>
            </div>
          ))}
        </div>

        <h3>Layout artifact preview</h3>
        {artifactQuery.isLoading ? <p>Loading layout artifacts...</p> : null}
        {artifactQuery.error ? (
          <p className="muted">No layout artifact available for this job.</p>
        ) : null}
        {artifactQuery.data ? (
          <>
            <pre>
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
                      <div className="muted">Page {page.page_number}</div>
                    </div>
                  );
                }),
              )}
            </div>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2>PDF preview</h2>
        {job.status === "completed" ? (
          <>
            <iframe
              title="result"
              className="pdf-frame"
              src={resultUrl(jobId)}
            />
            <a
              className="download-btn"
              href={resultUrl(jobId)}
              download={`trueform-${jobId}.pdf`}
            >
              Download PDF
            </a>
          </>
        ) : (
          <p>Preview will appear when processing is complete.</p>
        )}
      </div>
    </section>
  );
}
