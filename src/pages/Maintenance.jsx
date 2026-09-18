import { useNavigate } from "react-router-dom";
import { logActivity } from "../utils/activityLogService";

export default function Maintenance({ onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    void logActivity({
      module: "Authentication",
      action: "LOGOUT",
      description: "User logged out from maintenance mode",
      entityType: "user",
    });
    localStorage.removeItem("user");
    onLogout?.();
    navigate("/", { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-50 p-6 dark:bg-slate-900">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-900/50 dark:bg-slate-800">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl dark:bg-amber-900/40">!</div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">System Maintenance</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">NOSH POS is temporarily unavailable while maintenance is in progress.</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please try again later. Your work and data are being protected.</p>
        <button onClick={handleLogout} className="mt-6 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700">
          Logout
        </button>
      </div>
    </div>
  );
}
