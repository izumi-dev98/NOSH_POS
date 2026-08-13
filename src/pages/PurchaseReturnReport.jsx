import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function PurchaseReturnReport() {
  const [returns, setReturns] = useState([]);
  const [returnItems, setReturnItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [selectedReturnItems, setSelectedReturnItems] = useState([]);

  // FIFO breakdown modal
  const [showFifoModal, setShowFifoModal] = useState(false);
  const [fifoBreakdown, setFifoBreakdown] = useState([]);
  const [remainingValues, setRemainingValues] = useState({});

  // Filter states
  const [filterType, setFilterType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [returnsRes, itemsRes] = await Promise.all([
        supabase.from("purchase_returns").select("*").order("created_at", { ascending: false }),
        supabase.from("purchase_return_items").select("*")
      ]);

      if (!returnsRes.error) setReturns(returnsRes.data || []);
      if (!itemsRes.error) setReturnItems(itemsRes.data || []);

      // Calculate remaining values for each return
      const remainingVals = {};
      for (const ret of returnsRes.data || []) {
        const returnItemsList = (itemsRes.data || []).filter(i => i.return_id === ret.id);
        let remainingTotal = 0;

        for (const item of returnItemsList) {
          // Get current remaining qty from purchase_items
          const { data: purchaseItem } = await supabase
            .from("purchase_items")
            .select("qty, unit_price")
            .eq("id", item.purchase_item_id)
            .single();

          if (purchaseItem) {
            // Remaining value = current qty * unit price
            remainingTotal += (parseFloat(purchaseItem.qty) || 0) * (parseFloat(purchaseItem.unit_price) || 0);
          }
        }

        remainingVals[ret.id] = remainingTotal;
      }
      setRemainingValues(remainingVals);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const today = new Date().toISOString().split("T")[0];

  // Filter by date
  const filteredByDate = returns.filter(r => {
    if (filterType === "all") return true;

    const returnDate = r.created_at ? r.created_at.split("T")[0] : "";

    if (filterType === "today") {
      return returnDate === today;
    }

    if (filterType === "month") {
      const currentMonth = today.substring(0, 7);
      return returnDate.substring(0, 7) === currentMonth;
    }

    if (filterType === "year") {
      const currentYear = today.substring(0, 4);
      return returnDate.substring(0, 4) === currentYear;
    }

    if (filterType === "custom" && startDate && endDate) {
      return returnDate >= startDate && returnDate <= endDate;
    }

    return true;
  });

  // Filter by status
  const filteredByStatus = filteredByDate.filter(r => {
    if (statusFilter === "all") return true;
    return r.status === statusFilter;
  });

  // Filter by search
  const filteredReturns = filteredByStatus.filter(r => {
    const matchesSearch = r.return_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedReturns = filteredReturns.slice(startIndex, startIndex + itemsPerPage);

  // Calculate totals
  const totalReturns = filteredReturns.length;
  const totalItems = filteredReturns.reduce((sum, r) => sum + (parseInt(r.items_count) || 0), 0);

  // Total amount shows the returned amount (original behavior)
  const totalAmount = filteredReturns.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);

  // View details
  const viewDetails = async (ret) => {
    const items = returnItems.filter(i => i.return_id === ret.id);
    setSelectedReturn(ret);
    setSelectedReturnItems(items);
    setShowDetailModal(true);
  };

  // View FIFO breakdown for completed return
  const viewFifoBreakdown = async (ret) => {
    try {
      // Get return items
      const items = returnItems.filter(i => i.return_id === ret.id);

      // Get FIFO details for each item
      const fifoDetails = [];
      for (const item of items) {
        const { data: itemFifo } = await supabase
          .from("purchase_return_fifo")
          .select("*")
          .eq("return_item_id", item.id);

        fifoDetails.push({
          ...item,
          fifoLayers: itemFifo || []
        });
      }

      setFifoBreakdown(fifoDetails);
      setShowFifoModal(true);
    } catch (err) {
      console.error("Error fetching FIFO breakdown:", err);
      Swal.fire("Error", "Failed to load FIFO breakdown", "error");
    }
  };

  // Export Excel
  const exportToExcel = () => {
    const exportData = filteredReturns.map((ret) => ({
      "Return #": ret.return_number,
      "Date": ret.created_at ? new Date(ret.created_at).toLocaleDateString() : "-",
      "Status": ret.status || "pending",
      "Items": ret.items_count,
      "Total Amount": parseFloat(ret.total_amount) || 0
    }));

    // Add summary row
    exportData.push({
      "Return #": "TOTAL",
      "Date": "",
      "Status": "",
      "Items": totalItems,
      "Total Amount": totalAmount
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Return Report");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    saveAs(fileData, "Purchase_Return_Report.xlsx");
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-amber-100 text-amber-700",
      completed: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-slate-100 text-slate-700"
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status || "pending"}
      </span>
    );
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Return Report</h1>
          <p className="text-sm text-slate-500 mt-1">View and analyze purchase returns</p>
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
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Date Filter */}
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

          {/* Custom Date Range */}
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
                max={today}
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search return #..."
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
          <p className="text-sm text-slate-500">Total Returns</p>
          <p className="text-2xl font-bold text-slate-800">{totalReturns}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Total Items Returned</p>
          <p className="text-2xl font-bold text-slate-800">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Total Amount</p>
          <p className="text-2xl font-bold text-amber-600">{formatMMK(totalAmount)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Return #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Items</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Returned Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            ) : filteredReturns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No returns found</td>
              </tr>
            ) : (
              paginatedReturns.map((ret) => (
                <tr
                  key={ret.id}
                  className={`border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${
                    ret.status === "completed" ? "bg-emerald-50 dark:bg-emerald-900/20" :
                    ret.status === "cancelled" ? "bg-slate-50 dark:bg-slate-900/20" :
                    "bg-amber-50 dark:bg-amber-900/20"
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <button
                      onClick={() => viewDetails(ret)}
                      className="text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {ret.return_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ret.created_at ? new Date(ret.created_at).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(ret.status)}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{ret.items_count}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-600">{formatMMK(ret.total_amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => viewDetails(ret)}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                      >
                        View Details
                      </button>
                      {ret.status === "completed" && (
                        <button
                          onClick={() => viewFifoBreakdown(ret)}
                          className="px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
                          title="View FIFO Breakdown"
                        >
                          FIFO
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-3 text-right font-bold text-slate-800">Total</td>
              <td></td>
              <td></td>
              <td className="px-4 py-3 text-center font-bold text-slate-800">{totalItems}</td>
              <td className="px-4 py-3 text-right font-bold text-amber-600">{formatMMK(totalAmount)}</td>
              <td></td>
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

      {/* Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Return Details</h3>
                <p className="text-sm text-slate-500">{selectedReturn?.return_number}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Return #:</span>
                <span className="ml-2 font-semibold">{selectedReturn?.return_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Date:</span>
                <span className="ml-2">
                  {selectedReturn?.created_at ? new Date(selectedReturn.created_at).toLocaleString() : "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className="ml-2">{getStatusBadge(selectedReturn?.status)}</span>
              </div>
              <div>
                <span className="text-slate-500">Items:</span>
                <span className="ml-2 font-medium">{selectedReturn?.items_count}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Invoice #</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReturnItems.length > 0 ? (
                    selectedReturnItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-600 text-xs">{item.invoice_number}</td>
                        <td className="px-4 py-2 text-slate-800 font-medium">{item.item_name}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-slate-500">No items found</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-right font-bold text-slate-800">Grand Total</td>
                    <td className="px-4 py-2 text-right font-bold text-amber-600">{formatMMK(selectedReturn?.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIFO Breakdown Modal for Completed Returns */}
      {showFifoModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">FIFO Breakdown - Return Details</h3>
                <p className="text-sm text-slate-500">{selectedReturn?.return_number} (Completed)</p>
              </div>
              <button
                onClick={() => setShowFifoModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Return #:</span>
                <span className="ml-2 font-semibold">{selectedReturn?.return_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Date:</span>
                <span className="ml-2">
                  {selectedReturn?.created_at ? new Date(selectedReturn.created_at).toLocaleString() : "-"}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Total Amount:</span>
                <span className="ml-2 font-bold text-amber-600">{formatMMK(selectedReturn?.total_amount)}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Return Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Total</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">FIFO Layers Consumed</th>
                  </tr>
                </thead>
                <tbody>
                  {fifoBreakdown.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800 font-medium">{item.item_name}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                          {item.qty}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                      <td className="px-3 py-2 text-center">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-violet-600 hover:text-violet-800">
                            {item.fifoLayers?.length || 0} layer(s)
                          </summary>
                          <div className="mt-2 text-left bg-slate-50 p-2 rounded min-w-[200px]">
                            {item.fifoLayers && item.fifoLayers.length > 0 ? (
                              item.fifoLayers.map((fifo, fIdx) => (
                                <div key={fIdx} className="text-xs py-1.5 border-b border-slate-200 last:border-0">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-600">
                                      {fifo.source_type === "purchase" ? "Purchase" : "Add Stock"}
                                    </span>
                                    <span className="font-medium text-slate-800">
                                      {fifo.qty_reduced} @ {formatMMK(fifo.unit_price)}
                                    </span>
                                  </div>
                                  <div className="text-slate-500 text-xs mt-0.5">
                                    Value: {formatMMK(fifo.total_value)}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-400 italic">No FIFO records found</div>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right font-bold text-slate-800">Total</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-600">
                      {formatMMK(fifoBreakdown.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowFifoModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview & Print Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl shadow-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Purchase Return Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-purchase-return-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Purchase Return Report</title>
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
                            .summary { margin: 16px 0; display: flex; gap: 24px; }
                            .summary-item { font-size: 12px; }
                            .summary-label { color: #64748b; }
                            .summary-value { font-weight: bold; }
                            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
                            .badge-amber { background: #fef3c7; color: #d97706; }
                            .badge-emerald { background: #dcfce7; color: #16a34a; }
                            .badge-slate { background: #f1f5f9; color: #475569; }
                            .amber { color: #d97706; }
                            .slate { color: #64748b; }
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
              <div id="print-purchase-return-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Purchase Return Report</h1>
                <p className="text-sm text-slate-500 mb-4">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Return #</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Items</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Returned Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReturns.length === 0 ? (
                        <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                      ) : (
                        filteredReturns.map((ret) => {
                          const badgeClass = ret.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : ret.status === 'cancelled'
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-amber-100 text-amber-700';
                          const badgeStyle = ret.status === 'completed'
                            ? { background: '#dcfce7', color: '#16a34a' }
                            : ret.status === 'cancelled'
                            ? { background: '#f1f5f9', color: '#475569' }
                            : { background: '#fef3c7', color: '#d97706' };
                          return (
                            <tr key={ret.id} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                              <td className="px-4 py-3 font-medium text-slate-700">{ret.return_number}</td>
                              <td className="px-4 py-3 text-slate-600">
                                {ret.created_at ? new Date(ret.created_at).toLocaleDateString() : "-"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`} style={badgeStyle}>
                                  {ret.status || "pending"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-slate-600">{ret.items_count}</td>
                              <td className="px-4 py-3 text-right text-slate-600">{formatMMK(ret.total_amount)}</td>
                            </tr>
                          );
                        })
                      )}
                      {/* Summary row */}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td colSpan="3" className="px-4 py-3 text-right text-slate-700">TOTAL</td>
                        <td className="px-4 py-3 text-center text-slate-700">{totalItems}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{formatMMK(totalAmount)}</td>
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
