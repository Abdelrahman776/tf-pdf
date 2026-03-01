import { Route, Routes } from "react-router-dom";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import { AdminPage } from "./pages/AdminPage";
import { HomePage } from "./pages/HomePage";
import { JobPage } from "./pages/JobPage";

export function App() {
  return (
    <div className="app-root">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
