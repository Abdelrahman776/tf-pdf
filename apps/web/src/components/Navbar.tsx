import { useState, useEffect } from "react";
import { CreditCardIcon, MenuIcon, XIcon, LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle.tsx";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("tfpdf-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("tfpdf-theme", theme);
  }, [theme]);

  return (
    <nav className="sticky top-0 z-50 bg-tfwhite dark:bg-tfblack  dark:border-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-1.5" aria-label="Go to home">
            <img
              src="/tf-pdf-logo.png"
              alt="tf pdf logo"
              draggable="false"
              className="w-9 h-9 object-contain"
            />
            <div className="text-[1.65rem] leading-none font-bold tracking-tight">
              <span className="text-tfblue">TrueForm</span>
              <span className="text-tforange">PDF</span>
            </div>
          </Link>

          <div className="hidden sm:flex items-center space-x-3 h-full">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button className="h-9 flex items-center px-3 rounded-2xl text-[0.85rem] text-tfblack dark:text-tfwhite hover:bg-gray-300 dark:hover:bg-gray-700">
              <CreditCardIcon className="w-5 h-5 mr-1" />
              <p>Credits: N/A</p>
            </button>
            <button className="h-9 px-5 rounded-2xl text-tfwhite dark:text-tfwhite bg-tfblue hover:bg-blue-950 transition-colors flex items-center text-sm font-semibold">
              <LogIn className="mr-2 h-4 w-4" />
              <span>Sign In</span>
            </button>
          </div>

          <div className="flex items-center sm:hidden">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button
              onClick={toggleMenu}
              className="text-tfblack dark:text-tfwhite"
            >
              {isMenuOpen ? (
                <XIcon className="h-6 w-6" />
              ) : (
                <MenuIcon className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="sm:hidden bg-tfwhite dark:bg-tfblack shadow-lg">
          <div className="p-3">
            <button className="flex items-center gap-1 w-full px-3 py-3 text-tfblack dark:text-tfwhite">
              <CreditCardIcon className="w-5 h-5" />
              <p>Credits: N/A</p>
            </button>
            <button className="w-full px-3 py-2 rounded-sm text-tfwhite dark:text-tfwhite bg-tfblue flex content-center gap-2 items-center">
              <LogIn className="h-4 w-4 ml-auto" />
              <p className="mr-auto">Sign In</p>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
