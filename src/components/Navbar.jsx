import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import logo from "../assets/Main logo.jpg";

export default function Navbar({ toggleSidebar, theme, toggleTheme }) {
  const [user, setUser] = useState(null);
  const currentThemeLabel = theme === "dark" ? "Dark" : "Light";

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700 glass:bg-slate-900/55 glass:border-white/25 glass:backdrop-blur-3xl">
      {/* Left: Sidebar toggle + Logo + App Name + Myanmar New Year Greeting */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="text-lg text-slate-700 hover:text-indigo-600 active:scale-95 transition-all dark:text-slate-200 dark:hover:text-indigo-400 glass:text-slate-100 glass:hover:text-indigo-300"
          aria-label="Toggle Sidebar"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <img src={logo} alt="Logo" className="h-10 w-10 rounded-full object-cover border-2 border-indigo-400" />
        <h1 className="text-base text-yellow-500 sm:text-lg font-bold  dark:text-yellow-500 glass:text-yellow-500">
         NOSH POS
        </h1>
      </div>

      {/* Right: Theme toggle + Logged-in user */}
      {user && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full border border-slate-300 text-slate-700 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center transition-all dark:border-slate-600 dark:text-slate-200 dark:hover:text-indigo-400 glass:text-slate-100 glass:border-white/35 glass:hover:text-indigo-300 glass:hover:border-indigo-400"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
          >
            <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
          </button>
          <span className="hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 glass:bg-slate-800/70 glass:text-slate-100">
            {currentThemeLabel}
          </span>
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center dark:bg-indigo-900/60">
            <span className="text-indigo-600 font-semibold text-sm">
              {user.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="hidden sm:inline text-sm font-medium text-slate-700 capitalize dark:text-slate-200 glass:text-slate-100">
            {user.username}
          </span>
        </div>
      )}
    </header>
  );
}
