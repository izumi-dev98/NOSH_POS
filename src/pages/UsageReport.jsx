import { Fragment, useState, useEffect, useMemo } from "react";
import supabase from "../createClients";

export default function UsageReport() {
  const [records, setRecords] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [internalRecordItemsMap, setInternalRecordItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recordsRes, inventoryRes, categoriesRes] = await Promise.all([
        supabase.from("internal_consumption").select("*").eq("status", "completed").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("inventory").select("*").range(0, 9999),
        supabase.from("usage_stock_categories").select("*").order("id", { ascending: true }).range(0, 9999),
      ]);

      const internalRecords = (recordsRes.data || []).map((r) => ({
        ...r,
        record_type: "internal",
        display_id: `IC-${r.id}`,
      }));

      const internalRecordIds = (recordsRes.data || []).map((r) => r.id);
      const internalItemsRes = internalRecordIds.length > 0
        ? await supabase.from("internal_consumption_items").select("*").in("consumption_id", internalRecordIds).range(0, 9999)
        : { data: [] };

      const internalRecordItemsMap = {};
      (internalItemsRes.data || []).forEach((item) => {
        if (!internalRecordItemsMap[item.consumption_id]) internalRecordItemsMap[item.consumption_id] = [];
        internalRecordItemsMap[item.consumption_id].push(item);
      });

      setRecords(internalRecords);
      setInternalRecordItemsMap(internalRecordItemsMap);
      setInventory(inventoryRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (err) {
      console.error("Error:", err);
    }
    setLoading(false);
  };

  const filteredRecords = useMemo(() => {
    const now = new Date();
    let startDate = null;

    switch (dateFilter) {
      case "day":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "custom":
        if (customStart) startDate = new Date(customStart);
        break;
      default:
        startDate = null;
    }

    let endDate = null;
    if (dateFilter === "custom" && customEnd) {
      endDate = new Date(customEnd);
      endDate.setHours(23, 59, 59);
    }

    return records.filter((record) => {
      const recordDate = new Date(record.created_at);
      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;

      if (selectedCategory !== "all") {
        const items = internalRecordItemsMap[record.id] || [];
        const matchesCategory = items.some((item) => item.usage_stock_category_id === Number(selectedCategory));
        if (!matchesCategory) return false;
      }

      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        const matchesId = record.id.toString().includes(searchLower);
        const matchesUser = record.user_name?.toLowerCase().includes(searchLower);
        const matchesNotes = record.notes?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesUser && !matchesNotes) return false;
      }

      return true;
    });
  }, [records, dateFilter, customStart, customEnd, recordSearch, selectedCategory, internalRecordItemsMap, inventory]);

  const [expandedRecords, setExpandedRecords] = useState({});
  const [recordItems, setRecordItems] = useState({});

  const toggleRecord = async (recordId) => {
    const targetRecord = records.find((r) => r.id === recordId);
    if (expandedRecords[recordId]) {
      setExpandedRecords(prev => ({ ...prev, [recordId]: false }));
    } else {
      const { data } = await supabase.from("internal_consumption_items").select("*").eq("consumption_id", recordId);
      setRecordItems(prev => ({ ...prev, [recordId]: data || [] }));
      setExpandedRecords(prev => ({ ...prev, [recordId]: true }));
    }
  };

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

  const exportToExcel = async () => {
    const reportData = [];
    for (const record of filteredRecords) {
      const items = await supabase.from("internal_consumption_items").select("*").eq("consumption_id", record.id);
      for (const item of items.data || []) {
        const inv = inventory.find((i) => i.id === item.inventory_id);
        const beforeQty = inv ? inv.qty + item.qty : item.qty;
        const afterQty = inv ? inv.qty : 0;
        const categoryName = inv ? categories.find((cat) => cat.id === inv.category_id)?.name || "-" : "-";
        const unitPrice = Number(inv?.price ?? item.unit_price ?? 0) || 0;
        const lineTotal = unitPrice * Number(item.qty || 0);
        reportData.push({
          Date: new Date(record.created_at).toLocaleDateString(),
          "Record ID": record.display_id || record.id,
          "Type": "Internal Usage",
          "Category": categoryName,
          "Item Name": inv?.item_name || "Unknown",
          "Before Qty": beforeQty,
          "Used Qty": item.qty,
          "After Qty": afterQty,
          Unit: inv?.type || "-",
          "Unit Price": unitPrice,
          "Line Total": lineTotal,
          "User Name": record.user_name || user?.email || "Unknown",
          Notes: record.notes || "-",
        });
      }
    }

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"></head><body>
<table border="1">
<tr style="background:#ddd;font-weight:bold;">
<td>Date</td><td>Record ID</td><td>Type</td><td>Category</td><td>Item Name</td><td>Before Qty</td><td>Used Qty</td><td>After Qty</td><td>Unit</td><td>Unit Price</td><td>Line Total</td><td>User Name</td><td>Notes</td>
</tr>
${reportData.map(row =>
  `<tr>
  <td>${row.Date}</td>
  <td>${row["Record ID"]}</td>
  <td>${row.Type}</td>
  <td>${row.Category}</td>
  <td>${row["Item Name"]}</td>
  <td>${row["Before Qty"]}</td>
  <td>${row["Used Qty"]}</td>
  <td>${row["After Qty"]}</td>
  <td>${row.Unit}</td>
  <td>${Number(row["Unit Price"]).toFixed(2)}</td>
  <td>${Number(row["Line Total"]).toFixed(2)}</td>
  <td>${row["User Name"]}</td>
  <td>${row.Notes}</td>
  </tr>`
).join("")}
</table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `usage_report_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internal Usage Report</h1>
          <p className="text-sm text-slate-500 mt-1">View internal usage records only</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Preview & Print
          </button>
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Export Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search records..."
              value={recordSearch}
              onChange={(e) => { setRecordSearch(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Date</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
              ))}
            </select>
          </div>
          {dateFilter === "custom" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => { setCustomStart(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => { setCustomEnd(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border rounded-lg"
                />
              </div>
            </>
          )}
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredRecords.length} record(s)
          </div>
        </div>
      </div>


      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No usage records found</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Record ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map((record) => (
                  <Fragment key={record.id}>
                    <tr className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRecord(record.id)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold"
                        >
                          {expandedRecords[record.id] ? "−" : "+"}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{record.display_id || `#${record.id}`}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {(() => {
                          const itemsForRecord = internalRecordItemsMap[record.id] || [];
                          const names = [...new Set(itemsForRecord.map((it) => {
                            const invRow = inventory.find((i) => i.id === it.inventory_id);
                            const catId = invRow ? invRow.category_id : it.usage_stock_category_id;
                            return categories.find((c) => c.id === catId)?.name || '-';
                          }))].filter(Boolean).join(', ');
                          return names || '-';
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{new Date(record.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">{record.user_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{record.notes || "-"}</td>
                    </tr>
                    {expandedRecords[record.id] && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left border-b">
                                <th className="pb-2">Item Name</th>
                                <th className="pb-2">Before Qty</th>
                                <th className="pb-2">Used Qty</th>
                                <th className="pb-2">After Qty</th>
                                <th className="pb-2">Unit</th>
                                <th className="pb-2">Unit Price</th>
                                <th className="pb-2">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(recordItems[record.id] || []).map((item, idx) => {
                                const inv = inventory.find((i) => i.id === item.inventory_id);
                                const beforeQty = inv ? inv.qty + item.qty : item.qty;
                                const afterQty = inv ? inv.qty : 0;
                                const categoryName = categories.find((cat) => cat.id === item.usage_stock_category_id)?.name || "-";
                                const unitPrice = Number(inv?.price ?? item.unit_price ?? 0) || 0;
                                const lineTotal = unitPrice * Number(item.qty || 0);
                                return (
                                  <tr key={idx} className="border-t">
                                    <td className="py-2">{inv?.item_name || `Item ID: ${item.inventory_id}`}</td>
                                    <td className="py-2">{beforeQty}</td>
                                    <td className="py-2 text-red-600 font-medium">-{item.qty}</td>
                                    <td className="py-2 font-medium">{afterQty}</td>
                                    <td className="py-2">{inv?.type || "-"}</td>
                                    <td className="py-2">{unitPrice.toFixed(2)}</td>
                                    <td className="py-2">{lineTotal.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                              {/* Grand total for this record */}
                              <tr className="border-t">
                                <td colSpan={6} className="py-2 text-right font-semibold">Grand Total:</td>
                                <td className="py-2 font-semibold">{
                                  ((recordItems[record.id] || []).reduce((s, it) => {
                                    const invRow = inventory.find((i) => i.id === it.inventory_id);
                                    const unitP = Number(invRow?.price ?? it.unit_price ?? 0) || 0;
                                    return s + unitP * Number(it.qty || 0);
                                  }, 0)).toFixed(2)
                                }</td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Preview & Print Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl shadow-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Usage Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-usage-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Usage Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
                            .brand { font-size: 14px; color: #4f46e5; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 11px; }
                            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
                            th { background: #f1f5f9; font-weight: 600; }
                            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
                            .badge-indigo { background: #e0e7ff; color: #4338ca; }
                            .badge-orange { background: #ffedd5; color: #c2410c; }
                            @page { size: auto; margin: 10mm; }
                            @media print { body { padding: 0; } }
                          </style>
                        </head>
                        <body>
                          <div class="brand">Nosh POS</div>
                          ${printContent.innerHTML}
                          <script>window.onload = function() { window.print(); }</script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Print
                </button>
                <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <div id="print-usage-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Usage Report</h1>
                <p className="text-sm text-slate-500 mb-4">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Record ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">User</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Notes</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 ? (
                        <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                      ) : (
                        filteredRecords.map((record) => (
                          <tr key={record.id} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                            <td className="px-4 py-3 font-medium text-slate-700">{record.display_id || `#${record.id}`}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                Internal
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{new Date(record.created_at).toLocaleString()}</td>
                            <td className="px-4 py-3 text-slate-600">{record.user_name || "-"}</td>
                            <td className="px-4 py-3 text-slate-600">{record.notes || "-"}</td>
                            <td className="px-4 py-3 text-right font-semibold">{
                              ((internalRecordItemsMap[record.id] || []).reduce((s, it) => {
                                const invRow = inventory.find((i) => i.id === it.inventory_id);
                                const unitP = Number(invRow?.price ?? it.unit_price ?? 0) || 0;
                                return s + unitP * Number(it.qty || 0);
                              }, 0)).toFixed(2)
                            }</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
