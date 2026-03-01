import { Route, Routes, Link } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { HomePage } from "./pages/HomePage";
import { JobPage } from "./pages/JobPage";

export function App() {
  return (
    <div className="app-root">
      <header className="topbar">
        <h1>TrueForm PDF</h1>
        <nav>
          <Link to="/">Upload</Link>
          <span> · </span>
          <Link to="/admin">Admin</Link>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
