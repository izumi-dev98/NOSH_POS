import { useEffect, useMemo, useState } from "react";
import supabase from "../createClients";
import { logActivity, logPrint } from "../utils/activityLogService";

const PAGE_SIZE = 20;

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    const [{ data: logData, error: logError }, { data: userData }] = await Promise.all([
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).range(0, 4999),
      supabase.from("user").select("id, username, full_name, role").order("username", { ascending: true }),
    ]);

    if (logError) {
      setError(logError.message);
      setLogs([]);
    } else {
      setLogs(logData || []);
    }
    setUsers(userData || []);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loadActivity = async () => {
        await logActivity({
          module: "Activity Log",
          action: "VIEW",
          description: "Viewed activity log",
        });
        await fetchLogs();
      };
      void loadActivity();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const modules = useMemo(() => [...new Set(logs.map((log) => log.module).filter(Boolean))].sort(), [logs]);
  const actions = useMemo(() => [...new Set(logs.map((log) => log.action).filter(Boolean))].sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    return logs.filter((log) => {
      const logDate = new Date(log.created_at);
      const matchesSearch = !query || [
        log.username,
        log.description,
        log.module,
        log.action,
        log.entity_id,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesModule = moduleFilter === "all" || log.module === moduleFilter;
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesUser = userFilter === "all" || String(log.user_id) === userFilter;
      const matchesFrom = !from || logDate >= from;
      const matchesTo = !to || logDate <= to;
      return matchesSearch && matchesModule && matchesAction && matchesUser && matchesFrom && matchesTo;
    });
  }, [logs, search, moduleFilter, actionFilter, userFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const visibleLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const clearFilters = () => {
    setSearch("");
    setModuleFilter("all");
    setActionFilter("all");
    setUserFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const printLogs = async () => {
    await logPrint({
      module: "Activity Log",
      description: `Printed activity log (${filteredLogs.length} records)`,
      metadata: { record_count: filteredLogs.length },
    });
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-900">
      <style>{`@media print { .activity-no-print { display: none !important; } .activity-print-area { box-shadow: none !important; border: 0 !important; } }`}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 activity-no-print">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Activity Log</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track user actions, changes, and printed documents.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchLogs} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Refresh</button>
          <button onClick={printLogs} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Print Log</button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-6 activity-no-print dark:border-slate-700 dark:bg-slate-800">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search activity..." className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
        <select value={userFilter} onChange={(event) => { setUserFilter(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
          <option value="all">All Users</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}</option>)}
        </select>
        <select value={moduleFilter} onChange={(event) => { setModuleFilter(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
          <option value="all">All Modules</option>
          {modules.map((module) => <option key={module} value={module}>{module}</option>)}
        </select>
        <select value={actionFilter} onChange={(event) => { setActionFilter(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100">
          <option value="all">All Actions</option>
          {actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
        <div className="flex gap-2">
          <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
          <button onClick={clearFilters} className="rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">Clear</button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Run the activity log SQL migration first. {error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm activity-print-area dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 dark:bg-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Date / Time</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">User</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Module</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Action</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Description</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-500">Loading activity...</td></tr> : visibleLogs.length === 0 ? <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-500">No activity found.</td></tr> : visibleLogs.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTime(log.created_at)}</td>
                  <td className="px-4 py-3"><div className="font-medium text-slate-800 dark:text-slate-100">{log.username || "Unknown"}</div><div className="text-xs text-slate-500">{log.user_role || "-"}</div></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{log.module}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{log.action}</span></td>
                  <td className="max-w-md px-4 py-3 text-slate-700 dark:text-slate-200">{log.description}</td>
                  <td className="px-4 py-3 text-right activity-no-print"><button onClick={() => setSelectedLog(log)} className="text-indigo-600 hover:text-indigo-800">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700 activity-no-print">
          <span className="text-slate-500">{filteredLogs.length} record(s)</span>
          <div className="flex items-center gap-2"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>{page} / {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 activity-no-print">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Activity Details</h2>
                <p className="mt-1 text-xs text-slate-500">Log ID: {selectedLog.id}</p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="rounded px-2 text-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">X</button>
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">User</dt><dd className="font-medium text-slate-800 dark:text-slate-100">{selectedLog.username || "Unknown"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Role</dt><dd>{selectedLog.user_role || "-"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Date / Time</dt><dd>{formatDateTime(selectedLog.created_at)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Module</dt><dd>{selectedLog.module}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Action</dt><dd><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{selectedLog.action}</span></dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Entity Type</dt><dd>{selectedLog.entity_type || "-"}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Entity ID</dt><dd>{selectedLog.entity_id || "-"}</dd></div>
              <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs uppercase tracking-wide text-slate-500">Description</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{selectedLog.description}</dd></div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
