import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMoon, faSun, faUser, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import logo from "../assets/Main logo.jpg";
import supabase from "../createClients";
import Swal from "sweetalert2";
import { hashPassword, verifyPassword } from "../utils/passwordService";
import { logActivity } from "../utils/activityLogService";

export default function Navbar({ toggleSidebar, theme, toggleTheme, onUserUpdated, maintenanceMode, onMaintenanceToggle }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  const [showProfile, setShowProfile] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({ old: false, next: false, confirm: false });
  const currentThemeLabel = theme === "dark" ? "Dark" : "Light";

  const changePassword = async (event) => {
    event.preventDefault();
    if (!oldPassword || !newPassword || newPassword !== confirmPassword) {
      Swal.fire("Error", "Enter the old password and matching new passwords.", "error");
      return;
    }

    const validOldPassword = user.password_hash
      ? await verifyPassword(oldPassword, user.password_hash)
      : user.password === oldPassword;
    if (!validOldPassword) {
      Swal.fire("Error", "Old password is incorrect.", "error");
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    const { error } = await supabase
      .from("user")
      .update({ password_hash: passwordHash, password: null })
      .eq("id", user.id);
    if (error) {
      Swal.fire("Error", error.message, "error");
      return;
    }

    const updatedUser = { ...user, password_hash: passwordHash, password: null };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
    onUserUpdated?.(updatedUser);
    void logActivity({ module: "Authentication", action: "PASSWORD_CHANGE", description: "Changed account password", entityType: "user", entityId: user.id });
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setVisiblePasswords({ old: false, next: false, confirm: false });
    setShowPasswordForm(false);
    Swal.fire("Success", "Password changed successfully.", "success");
  };

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
          {user.role === "superadmin" && (
            <button
              onClick={onMaintenanceToggle}
              className={`hidden rounded-lg px-3 py-1.5 text-xs font-semibold sm:inline ${maintenanceMode ? "bg-amber-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-200"}`}
              title="Toggle maintenance mode"
            >
              {maintenanceMode ? "Maintenance On" : "Maintenance Off"}
            </button>
          )}
          <button onClick={() => setShowProfile((value) => !value)} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Open user profile">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/60"><FontAwesomeIcon icon={faUser} className="text-indigo-600" /></span>
            <span className="hidden text-sm font-medium capitalize text-slate-700 sm:inline dark:text-slate-200 glass:text-slate-100">{user.username}</span>
          </button>
          {showProfile && (
            <div className="absolute right-4 top-12 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-4 border-b border-slate-200 pb-3 dark:border-slate-700"><p className="font-semibold text-slate-800 dark:text-slate-100">{user.full_name || user.username}</p><p className="text-sm text-slate-500">@{user.username}</p></div>
              <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Role</dt><dd className="capitalize">{user.role}</dd></div><div><dt className="text-xs text-slate-500">Department</dt><dd>{user.department || "-"}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Position</dt><dd>{user.position || "-"}</dd></div></dl>
              {!showPasswordForm ? <button onClick={() => setShowPasswordForm(true)} className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">Change Password</button> : (
                <form onSubmit={changePassword} className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  {[{ key: "old", value: oldPassword, setValue: setOldPassword, placeholder: "Old password" }, { key: "next", value: newPassword, setValue: setNewPassword, placeholder: "New password" }, { key: "confirm", value: confirmPassword, setValue: setConfirmPassword, placeholder: "Confirm new password" }].map((field) => (
                    <div key={field.key} className="relative">
                      <input type={visiblePasswords[field.key] ? "text" : "password"} placeholder={field.placeholder} value={field.value} onChange={(e) => field.setValue(e.target.value)} className="w-full rounded-lg border px-3 py-2 pr-10 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white" required />
                      <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, [field.key]: !current[field.key] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-600" aria-label={visiblePasswords[field.key] ? `Hide ${field.placeholder}` : `Show ${field.placeholder}`}><FontAwesomeIcon icon={visiblePasswords[field.key] ? faEyeSlash : faEye} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2"><button type="button" onClick={() => setShowPasswordForm(false)} className="flex-1 rounded-lg border px-3 py-2 text-sm">Cancel</button><button type="submit" className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white">Save</button></div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
