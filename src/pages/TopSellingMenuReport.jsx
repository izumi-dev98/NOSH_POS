import { useEffect, useMemo, useState } from "react";
import supabase from "../createClients";

export default function TopSellingMenuReport() {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [presetFilter, setPresetFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: ordersData }, { data: itemsData }, { data: menusData }] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("order_items").select("*").range(0, 9999),
        supabase.from("menu").select("id, menu_name").range(0, 9999),
      ]);
      setOrders(ordersData || []);
      setOrderItems(itemsData || []);
      setMenus(menusData || []);
    } catch (err) {
      console.error("TopSellingMenuReport.fetchData error:", err);
      setOrders([]);
      setOrderItems([]);
      setMenus([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const getDate = (d) => { const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt; };

  const filteredOrderIds = useMemo(() => {
    const now = new Date();
    let start = null;
    if (presetFilter === "day") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (presetFilter === "week") start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (presetFilter === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    if (presetFilter === "year") start = new Date(now.getFullYear(), 0, 1);
    if (presetFilter === "custom" && customStart) start = new Date(customStart);
    let end = null;
    if (presetFilter === "custom" && customEnd) { end = new Date(customEnd); end.setHours(23,59,59,999); }

    return new Set((orders || [])
      .filter(o => String(o.status).toLowerCase() === "completed")
      .filter((o) => {
        const dt = getDate(o.created_at);
        if (start && dt && dt < start) return false;
        if (end && dt && dt > end) return false;
        return true;
      })
      .map(o => Number(o.id)));
  }, [orders, presetFilter, customStart, customEnd]);

  const aggregated = useMemo(() => {
    const map = {}; // key: menu_id or menu_name fallback
    const items = (orderItems || []).filter(it => filteredOrderIds.has(Number(it.order_id)));
    items.forEach((it) => {
      const menuKey = it.menu_id ? String(it.menu_id) : (it.menu_name || `unknown:${it.menu_id}`);
      const resolvedName = it.menu_id ? (menus.find(m => String(m.id) === String(it.menu_id))?.menu_name || it.menu_name || it.set_name || "Unknown") : (it.menu_name || it.set_name || "Unknown");
      if (!map[menuKey]) map[menuKey] = { menu_id: it.menu_id || null, menu_name: resolvedName, qty: 0, latestPrice: null, latestDate: null };
      map[menuKey].qty += Number(it.qty) || 0;
      const itemDate = getDate((orders || []).find(o => Number(o.id) === Number(it.order_id))?.created_at) || null;
      // Determine latest price by date
      if (itemDate && (!map[menuKey].latestDate || itemDate > map[menuKey].latestDate)) {
        map[menuKey].latestDate = itemDate;
        map[menuKey].latestPrice = Number(it.price || 0);
      }
      // fallback: use item.price if no date
      if (!map[menuKey].latestPrice && it.price != null) map[menuKey].latestPrice = Number(it.price || 0);
    });
    const arr = Object.values(map);
    // apply search
    const filtered = arr.filter(a => {
      if (!search) return true;
      return (a.menu_name || "").toLowerCase().includes(search.toLowerCase());
    });
    return filtered.sort((a,b) => b.qty - a.qty);
  }, [orderItems, orders, filteredOrderIds, search]);

  const totalPages = Math.max(1, Math.ceil(aggregated.length / rowsPerPage));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return aggregated.slice(start, start + rowsPerPage);
  }, [aggregated, currentPage]);

  const exportToExcel = () => {
    const rows = aggregated.map((r, idx) => ({ Rank: idx+1, "Menu Name": r.menu_name, "Latest Price": mmkFormatter.format(r.latestPrice || 0), "Total Qty": r.qty }));
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr style="background:#ddd;font-weight:bold;"><td>Rank</td><td>Menu Name</td><td>Latest Price</td><td>Total Qty</td></tr>${rows.map(row => `<tr><td>${row.Rank}</td><td>${row["Menu Name"]}</td><td>${row["Latest Price"]}</td><td>${row["Total Qty"]}</td></tr>`).join("")}<tr style="font-weight:bold;"><td colspan="3">Total Items</td><td>${aggregated.reduce((s,r)=>s+r.qty,0)}</td></tr></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `top_selling_menu_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Top Selling Menu Report</h1>
          <p className="text-sm text-slate-500 mt-1">Shows top selling menu items sorted by quantity sold</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPreviewModal(true)} className="px-4 py-2 bg-violet-600 text-white rounded">Preview & Print</button>
          <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 text-white rounded">Export Excel</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm">Filter</label>
            <select value={presetFilter} onChange={(e)=>setPresetFilter(e.target.value)} className="px-3 py-2 border rounded">
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {presetFilter === "custom" && (
            <>
              <div>
                <label className="block text-sm">Start</label>
                <input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="px-3 py-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm">End</label>
                <input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="px-3 py-2 border rounded" />
              </div>
            </>
          )}
          <div className="ml-auto">
            <label className="block text-sm">Search</label>
            <input type="text" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search menu..." className="px-3 py-2 border rounded" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Menu Name</th>
              <th className="px-4 py-3 text-left">Latest Price</th>
              <th className="px-4 py-3 text-left">Total Qty</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center">Loading...</td></tr>
            ) : aggregated.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center">No data</td></tr>
            ) : (
              paginated.map((r, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-4 py-3">{(currentPage-1)*rowsPerPage + idx+1}</td>
                  <td className="px-4 py-3">{r.menu_name}</td>
                  <td className="px-4 py-3">{mmkFormatter.format(r.latestPrice || 0)}</td>
                  <td className="px-4 py-3">{r.qty}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-slate-600">Total items: {aggregated.reduce((s,r)=>s+r.qty,0)}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage===1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Prev</button>
          <span className="text-sm">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage===totalPages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold">Top Selling Menu Report</h3>
                <p className="text-sm text-slate-500">Generated: {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => {
                  const printContent = document.getElementById('print-top-selling');
                  if (!printContent) return;
                  const w = window.open('','_blank'); if (!w) return;
                  w.document.write(`<html><head><title>Top Selling Menu</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}</style></head><body>${printContent.innerHTML}<script>window.onload=function(){window.print();}</script></body></html>`);
                  w.document.close();
                }} className="px-4 py-2 bg-indigo-600 text-white rounded">Print</button>
                <button onClick={() => setShowPreviewModal(false)} className="px-3 py-1 border rounded">Close</button>
              </div>
            </div>
            <div id="print-top-selling">
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr><th className="px-4 py-2 text-left">Rank</th><th className="px-4 py-2 text-left">Menu Name</th><th className="px-4 py-2 text-left">Latest Price</th><th className="px-4 py-2 text-left">Total Qty</th></tr></thead>
                <tbody>
                  {aggregated.map((r, idx) => (
                    <tr key={idx}><td className="px-4 py-2">{idx+1}</td><td className="px-4 py-2">{r.menu_name}</td><td className="px-4 py-2">{mmkFormatter.format(r.latestPrice || 0)}</td><td className="px-4 py-2">{r.qty}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
