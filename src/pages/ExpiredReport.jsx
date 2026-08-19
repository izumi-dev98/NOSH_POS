import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { openReportPrintPreview } from "../utils/reportPrintPreview";

export default function ExpiredReport() {
  const [expiryLog, setExpiryLog] = useState([]);
  const [expiredItems, setExpiredItems] = useState([]);
  const [nearExpiredItems, setNearExpiredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const itemsPerPage = 10;

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch expiry log (audit trail)
      const { data: logData } = await supabase
        .from("expiry_log")
        .select("*")
        .order("expired_at", { ascending: false });

      // Fetch currently expired purchase items (for items still marked expired)
      const { data: itemsData } = await supabase
        .from("purchase_items")
        .select("id, item_name, original_qty, qty, foc_qty, unit_price, expiry_date, purchase_id, is_expired")
        .eq("is_expired", true)
        .order("expiry_date", { ascending: false });
      setExpiredItems(itemsData || []);

      const nearExpiryDate = new Date();
      nearExpiryDate.setDate(nearExpiryDate.getDate() + 7);
      const { data: nearItemsData } = await supabase
        .from("purchase_items")
        .select("id, item_name, qty, expiry_date, purchase_id, is_expired")
        .eq("is_expired", false)
        .gt("expiry_date", new Date().toISOString().split("T")[0])
        .lte("expiry_date", nearExpiryDate.toISOString().split("T")[0])
        .gt("qty", 0)
        .order("expiry_date", { ascending: true });

      const purchaseIds = [...(logData || []), ...(itemsData || []), ...(nearItemsData || [])]
        .map((item) => item.purchase_id)
        .filter(Boolean);
      const { data: purchases } = purchaseIds.length > 0
        ? await supabase.from("purchases").select("id, invoice_number").in("id", purchaseIds)
        : { data: [] };
      const invoiceByPurchaseId = (purchases || []).reduce((map, purchase) => {
        map[purchase.id] = purchase.invoice_number;
        return map;
      }, {});

      setExpiryLog((logData || []).map((log) => ({
        ...log,
        status: "Expired",
        invoice_number: invoiceByPurchaseId[log.purchase_id] || "-"
      })));
      setNearExpiredItems((nearItemsData || []).map((item) => ({
        ...item,
        expired_qty: item.qty,
        expired_at: null,
        status: "Near Expire (1 Week)",
        invoice_number: invoiceByPurchaseId[item.purchase_id] || "-"
      })));
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const today = new Date().toISOString().split("T")[0];

  // Filter expiry log by date
  const filteredLog = expiryLog.filter(log => {
    if (filterType === "all") return true;

    const expiredDate = log.expired_at ? log.expired_at.split("T")[0] : "";

    if (filterType === "today") return expiredDate === today;
    if (filterType === "month") {
      const currentMonth = today.substring(0, 7);
      return expiredDate.substring(0, 7) === currentMonth;
    }
    if (filterType === "year") {
      const currentYear = today.substring(0, 4);
      return expiredDate.substring(0, 4) === currentYear;
    }
    if (filterType === "custom" && startDate && endDate) {
      return expiredDate >= startDate && expiredDate <= endDate;
    }
    return true;
  });

  const filteredNearExpired = nearExpiredItems.filter((item) => {
    const expiryDate = item.expiry_date || "";
    if (filterType === "all") return true;
    if (filterType === "today") return expiryDate === today;
    if (filterType === "month") return expiryDate.substring(0, 7) === today.substring(0, 7);
    if (filterType === "year") return expiryDate.substring(0, 4) === today.substring(0, 4);
    if (filterType === "custom" && startDate && endDate) return expiryDate >= startDate && expiryDate <= endDate;
    return true;
  });

  // Filter by search
  const filtered = [...filteredLog, ...filteredNearExpired].filter(log => {
    if (statusFilter !== "all" && log.status?.toLowerCase() !== statusFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.item_name?.toLowerCase().includes(term) ||
      log.expiry_date?.includes(term) ||
      log.invoice_number?.toLowerCase().includes(term) ||
      log.status?.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

  // Summary
  const totalExpired = filtered.length;
  const totalExpiredQty = filtered.reduce((sum, log) => sum + (parseFloat(log.expired_qty) || 0), 0);
  const nearExpiredCount = filtered.filter((log) => log.status === "Near Expire (1 Week)").length;

  // Export Excel
  const exportToExcel = () => {
    const exportData = filtered.map((log) => ({
      "Item": log.item_name,
      "Expired Qty": parseFloat(log.expired_qty) || 0,
      "Expiry Date": log.expiry_date || "-",
      "Expired At": log.expired_at ? new Date(log.expired_at).toLocaleString() : "-",
      "Status": log.status || "Expired",
      "Invoice #": log.invoice_number || "-"
    }));

    exportData.push({
      "Item": "TOTAL",
      "Expired Qty": totalExpiredQty,
      "Expiry Date": "",
      "Expired At": "",
      "Status": "",
      "Invoice #": ""
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Expire Report");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(fileData, "Expire_Report.xlsx");
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Expire Report</h1>
          <p className="text-sm text-slate-500 mt-1">Track expired items and inventory loss</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openReportPrintPreview("Expire Report")}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
          >
            Print
          </button>
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setStartDate("");
              setEndDate("");
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Date</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="expired">Expired</option>
            <option value="near expire (1 week)">Near Expire (1 Week)</option>
          </select>

          {filterType === "custom" && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-slate-500 self-center">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => setCurrentPage(1)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
              >
                Apply
              </button>
            </>
          )}

          <input
            type="text"
            placeholder="Search item name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Report Records</p>
          <p className="text-2xl font-bold text-slate-800">{totalExpired}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Total Units Expired</p>
          <p className="text-2xl font-bold text-rose-600">{totalExpiredQty}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Near Expire (1 Week) Items</p>
          <p className="text-2xl font-bold text-amber-600">{nearExpiredCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Expired Qty</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Expiry Date</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Expired At</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Invoice #</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No expired or near-expire items found</td>
              </tr>
            ) : (
              paginated.map((log) => (
                <tr
                  key={log.id}
                  className="border-t border-slate-100 hover:bg-rose-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-800">{log.item_name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">
                      {log.expired_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{log.expiry_date || "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-600">
                    {log.expired_at ? new Date(log.expired_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.status === "Near Expire (1 Week)" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                      {log.status || "Expired"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{log.invoice_number || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-3 text-right font-bold text-slate-800">Total</td>
              <td className="px-4 py-3 text-center font-bold text-rose-600">{totalExpiredQty}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100"
          >
            Next
          </button>
        </div>
      )}

      {/* Preview & Print Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl shadow-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Expire Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-expired-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Expire Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
                            .brand { font-size: 14px; color: #4f46e5; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 11px; }
                            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
                            th { background: #f1f5f9; font-weight: 600; }
                            .text-right { text-align: right; }
                            .text-center { text-align: center; }
                            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
                            .badge-rose { background: #ffe4e6; color: #e11d48; }
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
              <div id="print-expired-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Expire Report</h1>
                <p className="text-sm text-slate-500 mb-4">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Expired Qty</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Expiry Date</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Expired At</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Invoice #</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                      ) : (
                        filtered.map((log) => (
                          <tr key={log.id} className="border-b border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-700">{log.item_name}</td>
                            <td className="px-4 py-3 text-center text-rose-600">{log.expired_qty}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{log.expiry_date || "-"}</td>
                            <td className="px-4 py-3 text-center text-slate-600">
                              {log.expired_at ? new Date(log.expired_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-4 py-3 text-center">{log.status || "Expired"}</td>
                            <td className="px-4 py-3 text-center text-slate-600">{log.invoice_number || "-"}</td>
                          </tr>
                        ))
                      )}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td className="px-4 py-3 text-right text-slate-700">TOTAL</td>
                        <td className="px-4 py-3 text-center text-rose-600">{totalExpiredQty}</td>
                        <td colSpan="4"></td>
                      </tr>
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
