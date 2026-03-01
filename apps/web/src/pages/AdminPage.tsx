import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { adminGetJobEvents, adminListJobs } from "../api.ts";

export function AdminPage() {
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const jobsQuery = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => adminListJobs(100),
    refetchInterval: 5000,
  });

  const eventsQuery = useQuery({
    queryKey: ["admin-job-events", selectedJobId],
    queryFn: () => adminGetJobEvents(selectedJobId, 500),
    enabled: Boolean(selectedJobId),
    refetchInterval: 5000,
  });

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);

  return (
    <section className="result-grid">
      <div className="card">
        <h2>Admin Jobs</h2>
        {jobsQuery.isLoading ? <p>Loading jobs...</p> : null}
        {jobsQuery.error ? (
          <p className="error">{(jobsQuery.error as Error).message}</p>
        ) : null}

        <div className="admin-list">
          {jobs.map((job) => (
            <button
              type="button"
              key={job.id}
              className={
                selectedJobId === job.id ? "admin-job active" : "admin-job"
              }
              onClick={() => setSelectedJobId(job.id)}
            >
              <div>
                <b>{job.status}</b> · {job.progress}%
              </div>
              <div className="muted">{job.id}</div>
              <div className="muted">{job.message}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Selected Job Events</h2>
        {!selectedJobId ? <p>Select a job first.</p> : null}
        {eventsQuery.isLoading ? <p>Loading events...</p> : null}
        {eventsQuery.error ? (
          <p className="error">{(eventsQuery.error as Error).message}</p>
        ) : null}

        <div className="timeline">
          {(eventsQuery.data ?? []).map((event, index) => (
            <div className="timeline-item" key={`${event.at}-${index}`}>
              <div className="timeline-time">
                {new Date(event.at).toLocaleString()}
              </div>
              <div className="timeline-text">
                <b>{event.status}</b> - {event.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
