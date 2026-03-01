import { Route, Routes } from "react-router-dom";
import Footer from "./components/Footer.tsx";
import Navbar from "./components/Navbar.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { JobPage } from "./pages/JobPage.tsx";

export function App() {
  return (
    <div className="app-root">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs/new" element={<JobPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
