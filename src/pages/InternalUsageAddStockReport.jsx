import { Fragment, useState, useEffect, useMemo } from "react";
import supabase from "../createClients";

export default function InternalUsageAddStockReport() {
  const [records, setRecords] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [addStockCategories, setAddStockCategories] = useState([]);
  const [usageCategories, setUsageCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [recordItemsMap, setRecordItemsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && showPreviewModal) setShowPreviewModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPreviewModal]);

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [addStockRes, usageRes, inventoryRes, addCatRes, usageCatRes] = await Promise.all([
        supabase.from("internal_consumption").select("*").eq("status", "add_stock").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("internal_consumption").select("*").eq("status", "completed").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("inventory").select("*").range(0, 9999),
        supabase.from("add_stock_categories").select("*").order("id", { ascending: true }).range(0, 9999),
        supabase.from("usage_stock_categories").select("*").order("id", { ascending: true }).range(0, 9999),
      ]);

      // Combine records with type indicator
      const addStockRecords = (addStockRes.data || []).map((r) => ({
        ...r,
        record_type: "add_stock",
        display_id: `AS-${r.id}`,
      }));

      const usageRecords = (usageRes.data || []).map((r) => ({
        ...r,
        record_type: "usage",
        display_id: `IC-${r.id}`,
      }));

      const allRecords = [...addStockRecords, ...usageRecords].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      const recordIds = allRecords.map((r) => r.id);
      const itemsRes = recordIds.length > 0
        ? await supabase.from("internal_consumption_items").select("*").in("consumption_id", recordIds).range(0, 9999)
        : { data: [] };

      const recordMap = {};
      (itemsRes.data || []).forEach((item) => {
        if (!recordMap[item.consumption_id]) recordMap[item.consumption_id] = [];
        recordMap[item.consumption_id].push(item);
      });

      setRecordItemsMap(recordMap);
      setRecords(allRecords);
      setInventory(inventoryRes.data || []);
      setAddStockCategories(addCatRes.data || []);
      setUsageCategories(usageCatRes.data || []);
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

      if (selectedType !== "all" && record.record_type !== selectedType) return false;

      if (selectedCategory !== "all") {
        const items = recordItemsMap[record.id] || [];
        const categoryField = record.record_type === "add_stock" ? "add_stock_category_id" : "usage_stock_category_id";
        const matchesCategory = items.some((item) => item[categoryField] === Number(selectedCategory));
        if (!matchesCategory) return false;
      }

      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        const matchesId = record.display_id.toLowerCase().includes(searchLower);
        const matchesUser = record.user_name?.toLowerCase().includes(searchLower);
        const matchesNotes = record.notes?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesUser && !matchesNotes) return false;
      }

      return true;
    });
  }, [records, dateFilter, customStart, customEnd, recordSearch, selectedCategory, selectedType, recordItemsMap]);

  const [expandedRecords, setExpandedRecords] = useState({});
  const [recordItems, setRecordItems] = useState({});

  const toggleRecord = async (recordId) => {
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

  const printReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    let grandTotal = 0;
    const reportRows = filteredRecords.flatMap((record) => {
      const items = recordItemsMap[record.id] || [];
      return items.map((item) => {
        const inv = inventory.find((i) => i.id === item.inventory_id);
        const categoryField = record.record_type === "add_stock" ? "add_stock_category_id" : "usage_stock_category_id";
        const categories = record.record_type === "add_stock" ? addStockCategories : usageCategories;
        const categoryName = categories.find((category) => category.id === item[categoryField])?.name || "";
        const beforeQty = inv ? inv.qty - item.qty : item.qty;
        const afterQty = inv ? inv.qty : item.qty;
        const unitPrice = Number(inv?.price || 0);
        const lineTotal = unitPrice * (Number(item.qty) || 0);
        grandTotal += lineTotal;

        return `<tr>
          <td>${new Date(record.created_at).toLocaleDateString()}</td>
          <td>${record.display_id}</td>
          <td>${record.record_type === "add_stock" ? "Add Stock" : "Internal Usage"}</td>
          <td>${categoryName}</td>
          <td>${inv?.item_name || "Unknown"}</td>
          <td class="number">${beforeQty}</td>
          <td class="number">${item.qty}</td>
          <td class="number">${afterQty}</td>
          <td>${inv?.type || "-"}</td>
          <td class="number">${mmkFormatter.format(unitPrice)}</td>
          <td class="number">${mmkFormatter.format(lineTotal)}</td>
          <td>${record.user_name || user?.email || "-"}</td>
          <td>${record.notes || "-"}</td>
        </tr>`;
      });
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Nosh POS - Internal Usage / Add Stock Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin: 0 0 4px; }
            .subtitle { color: #64748b; font-size: 12px; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f1f5f9; }
            .number { text-align: right; }
            .total { font-weight: 700; background: #f1f5f9; }
            .print-button { background: #4f46e5; color: white; border: 0; border-radius: 6px; padding: 9px 18px; cursor: pointer; margin-bottom: 16px; }
            .print-button:hover { background: #3730a3; }
            .print-button:focus-visible { outline: 3px solid #a5b4fc; outline-offset: 2px; }
            @media print { body { padding: 0; } .print-button { display: none; } }
            @page { size: auto; margin: 10mm; }
          </style>
        </head>
        <body>
          <button class="print-button" onclick="window.print()">Print</button>
          <h1>Nosh POS</h1>
          <h2>Internal Usage / Add Stock Report</h2>
          <p class="subtitle">Generated: ${new Date().toLocaleDateString()}</p>
          <table>
            <thead><tr>
              <th>Date</th><th>Record ID</th><th>Type</th><th>Category</th><th>Item Name</th>
              <th>Before Qty</th><th>Qty</th><th>Closing Qty</th><th>Unit</th><th>Unit Price</th>
              <th>Line Total</th><th>User Name</th><th>Notes</th>
            </tr></thead>
            <tbody>${reportRows || '<tr><td colspan="13">No data found</td></tr>'}</tbody>
            <tfoot><tr class="total"><td colspan="10">Grand Total</td><td class="number">${mmkFormatter.format(grandTotal)}</td><td colspan="2"></td></tr></tfoot>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportToExcel = async () => {
    const reportData = [];
    let grandTotal = 0;
    for (const record of filteredRecords) {
      const items = recordItemsMap[record.id] || [];
      for (const item of items) {
        const inv = inventory.find((i) => i.id === item.inventory_id);
        const categoryField = record.record_type === "add_stock" ? "add_stock_category_id" : "usage_stock_category_id";
        const categoryId = item[categoryField];
        const categories = record.record_type === "add_stock" ? addStockCategories : usageCategories;
        const categoryName = categories.find((cat) => cat.id === categoryId)?.name || "";
        const beforeQty = inv ? inv.qty - item.qty : item.qty;
        const afterQty = inv ? inv.qty : item.qty;
        const unitPrice = Number(inv?.price || 0);
        const lineTotal = unitPrice * (Number(item.qty) || 0);
        grandTotal += lineTotal;
        reportData.push({
          Date: new Date(record.created_at).toLocaleDateString(),
          "Record ID": record.display_id,
          Type: record.record_type === "add_stock" ? "Add Stock" : "Internal Usage",
          "Category": categoryName,
          "Item Name": inv?.item_name || "Unknown",
          "Before Qty": beforeQty,
          "Qty": item.qty,
          "Closing Qty": afterQty,
          Unit: inv?.type || "-",
          "Unit Price": unitPrice,
          "Line Total": lineTotal,
          "User Name": record.user_name || user?.email || "-",
          Notes: record.notes || "-",
        });
      }
    }

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Nosh POS - Internal Usage / Add Stock Report</title></head><body>
<h1>Nosh POS</h1><h2>Internal Usage / Add Stock Report</h2><p>Generated: ${new Date().toLocaleDateString()}</p>
<table border="1">
<tr style="background:#ddd;font-weight:bold;">
<td>Date</td><td>Record ID</td><td>Type</td><td>Category</td><td>Item Name</td><td>Before Qty</td><td>Qty</td><td>Closing Qty</td><td>Unit</td><td>Unit Price</td><td>Line Total</td><td>User Name</td><td>Notes</td>
</tr>
${reportData.map(row =>
  `<tr>
  <td>${row.Date}</td>
  <td>${row["Record ID"]}</td>
  <td>${row.Type}</td>
  <td>${row.Category}</td>
  <td>${row["Item Name"]}</td>
  <td>${row["Before Qty"]}</td>
  <td>${row.Qty}</td>
  <td>${row["Closing Qty"]}</td>
  <td>${row.Unit}</td>
  <td>${mmkFormatter.format(row["Unit Price"])}</td>
  <td>${mmkFormatter.format(row["Line Total"])}</td>
  <td>${row["User Name"]}</td>
  <td>${row.Notes}</td>
  </tr>`
).join("")}
<tr style="font-weight:bold;"><td colspan="11">Grand Total</td><td>${mmkFormatter.format(grandTotal)}</td><td></td></tr>
</table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `internal_usage_add_stock_report_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internal Usage / Add Stock Report</h1>
          <p className="text-sm text-slate-500 mt-1">View all internal consumption and stock addition records</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Print
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="add_stock">Add Stock</option>
              <option value="usage">Internal Usage</option>
            </select>
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
              {selectedType === "add_stock" || selectedType === "all" ? (
                addStockCategories.map((cat) => (
                  <option key={`add-${cat.id}`} value={cat.id.toString()}>{cat.name}</option>
                ))
              ) : null}
              {selectedType === "usage" || selectedType === "all" ? (
                usageCategories.map((cat) => (
                  <option key={`usage-${cat.id}`} value={cat.id.toString()}>{cat.name}</option>
                ))
              ) : null}
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
        <div className="text-center py-10 text-slate-500">No records found</div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Record ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
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
                      <td className="px-4 py-3 font-semibold text-slate-800">{record.display_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          record.record_type === "add_stock"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {record.record_type === "add_stock" ? "Add Stock" : "Internal Usage"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{new Date(record.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {(() => {
                          const items = recordItemsMap[record.id] || [];
                          const categoryField = record.record_type === "add_stock" ? "add_stock_category_id" : "usage_stock_category_id";
                          const categories = record.record_type === "add_stock" ? addStockCategories : usageCategories;
                          const categoryNames = [...new Set(items.map((it) => {
                            const catId = it[categoryField];
                            return categories.find((c) => c.id === catId)?.name || '';
                          }))].filter(Boolean).join(', ');
                          return categoryNames || '';
                        })()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.user_name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{record.notes || "-"}</td>
                    </tr>
                    {expandedRecords[record.id] && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left border-b">
                                <th className="pb-2">Item Name</th>
                                <th className="pb-2">Before Qty</th>
                                <th className="pb-2">Qty</th>
                                <th className="pb-2">Closing Qty</th>
                                <th className="pb-2">Unit</th>
                                <th className="pb-2">Unit Price</th>
                                <th className="pb-2">Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const items = recordItems[record.id] || [];
                                const recordTotal = items.reduce((sum, item) => {
                                  const inv = inventory.find((i) => i.id === item.inventory_id);
                                  const unitPrice = Number(inv?.price || 0);
                                  return sum + unitPrice * (Number(item.qty) || 0);
                                }, 0);
                                return (
                                  <>
                                    {items.map((item, idx) => {
                                      const inv = inventory.find((i) => i.id === item.inventory_id);
                                      const beforeQty = inv ? inv.qty - item.qty : item.qty;
                                      const afterQty = inv ? inv.qty : item.qty;
                                      const unitPrice = Number(inv?.price || 0);
                                      const lineTotal = unitPrice * (Number(item.qty) || 0);
                                      return (
                                        <tr key={idx} className="border-t">
                                          <td className="py-2">{inv?.item_name || `Item ID: ${item.inventory_id}`}</td>
                                          <td className="py-2">{beforeQty}</td>
                                          <td className={`py-2 font-medium ${record.record_type === "add_stock" ? "text-green-600" : "text-red-600"}`}>
                                            {record.record_type === "add_stock" ? "+" : "-"}{item.qty}
                                          </td>
                                          <td className="py-2 font-medium">{afterQty}</td>
                                          <td className="py-2">{inv?.type || "-"}</td>
                                          <td className="py-2">{mmkFormatter.format(unitPrice)}</td>
                                          <td className="py-2">{mmkFormatter.format(lineTotal)}</td>
                                        </tr>
                                      );
                                    })}
                                    <tr className="border-t bg-slate-100 font-semibold">
                                      <td className="py-2" colSpan={6}>Record Total</td>
                                      <td className="py-2">{mmkFormatter.format(recordTotal)}</td>
                                    </tr>
                                  </>
                                );
                              })()}
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

          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Nosh POS</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Internal Usage / Add Stock Report | Generated: {new Date().toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={printReport}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
                >
                  Print
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">Record ID</th>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">Type</th>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">Date</th>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">Category</th>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">User</th>
                    <th className="px-4 py-3 text-slate-700 dark:text-slate-200">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No records found</td></tr>
                  ) : filteredRecords.map((record) => {
                    const categoryField = record.record_type === "add_stock" ? "add_stock_category_id" : "usage_stock_category_id";
                    const categories = record.record_type === "add_stock" ? addStockCategories : usageCategories;
                    const categoryNames = [...new Set((recordItemsMap[record.id] || [])
                      .map((item) => categories.find((category) => category.id === item[categoryField])?.name)
                      .filter(Boolean))].join(", ");
                    return (
                      <tr key={record.id} className="border-t border-slate-100 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{record.display_id}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{record.record_type === "add_stock" ? "Add Stock" : "Internal Usage"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(record.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{categoryNames || "-"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{record.user_name || user?.email || "-"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{record.notes || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
