import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function PurchaseReport() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Return details modal
  const [showReturnDetailsModal, setShowReturnDetailsModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [returnFifoDetails, setReturnFifoDetails] = useState([]);
  const [currentValues, setCurrentValues] = useState({});

  // Filter states
  const [filterType, setFilterType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const calculateTotal = (purchase) => {
    const purchaseItemsData = purchase._items || [];
    if (purchaseItemsData.length === 0) return 0;

    return purchaseItemsData.reduce((sum, item) => {
      const beforeQty = parseFloat(item.original_qty || item.qty) || 0;
      const focQty = parseFloat(item.foc_qty) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const billableQty = beforeQty - focQty;
      return sum + (billableQty * unitPrice);
    }, 0);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase.from("purchases").select("*").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").order("name", { ascending: true })
      ]);

      if (!purchasesRes.error) {
        const purchasesData = purchasesRes.data || [];
        setPurchases(purchasesData);

        // Calculate total for each purchase and store items
        const values = {};
        const purchasesWithItems = [];
        for (const purchase of purchasesData) {
          const { data: items } = await supabase
            .from("purchase_items")
            .select("*")
            .eq("purchase_id", purchase.id);

          // Store items with purchase for later use
          purchasesWithItems.push({ ...purchase, _items: items || [] });

          values[purchase.id] = (items || []).reduce((sum, item) => {
            const beforeQty = parseFloat(item.original_qty || item.qty) || 0;
            const focQty = parseFloat(item.foc_qty) || 0;
            const unitPrice = parseFloat(item.unit_price) || 0;
            const billableQty = beforeQty - focQty;
            return sum + (billableQty * unitPrice);
          }, 0);
        }
        setPurchases(purchasesWithItems);
        setCurrentValues(values);
      }
      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);
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
  const filteredByDate = purchases.filter(p => {
    if (filterType === "all") return true;

    const purchaseDate = p.date;

    if (filterType === "today") {
      return purchaseDate === today;
    }

    if (filterType === "month") {
      const currentMonth = today.substring(0, 7);
      return purchaseDate.substring(0, 7) === currentMonth;
    }

    if (filterType === "year") {
      const currentYear = today.substring(0, 4);
      return purchaseDate.substring(0, 4) === currentYear;
    }

    if (filterType === "custom" && startDate && endDate) {
      return purchaseDate >= startDate && purchaseDate <= endDate;
    }

    return true;
  });

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Filter by status
  const filteredByStatus = filteredByDate.filter(p => {
    if (statusFilter === "all") return true;
    return p.status === statusFilter;
  });

  // Filter by search
  const filteredPurchases = filteredByStatus.filter(p => {
    const matchesSearch = p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (getSupplierName(p.supplier_id) || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredPurchases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPurchases = filteredPurchases.slice(startIndex, startIndex + itemsPerPage);

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });

    setSelectedPurchase(purchase);
    setPurchaseItems(items || []);
    setShowDetailModal(true);
  };

  const getReturnedQty = (itemOriginalQty, itemCurrentQty) => {
    // Returns negative number representing returned quantity
    // original_qty - current_qty = how much was returned (as negative)
    const returned = (itemCurrentQty || 0) - (itemOriginalQty || 0);
    return returned;
  };

  // View return details with FIFO breakdown
  const viewReturnDetails = async (purchase) => {
    try {
      // Get all returns for this purchase
      const { data: returns } = await supabase
        .from("purchase_return_items")
        .select(`
          *,
          purchase_returns (
            id,
            return_number,
            status,
            created_at
          )
        `)
        .eq("purchase_id", purchase.id);

      if (!returns || returns.length === 0) {
        return Swal.fire("Info", "No returns found for this purchase", "info");
      }

      // Get FIFO details for each return item
      const returnItemsWithFifo = [];
      for (const retItem of returns) {
        const { data: fifoDetails } = await supabase
          .from("purchase_return_fifo")
          .select("*")
          .eq("return_item_id", retItem.id);

        returnItemsWithFifo.push({
          ...retItem,
          fifoDetails: fifoDetails || [],
          returnInfo: retItem.purchase_returns
        });
      }

      setSelectedReturn({
        purchase,
        items: returnItemsWithFifo
      });
      setReturnFifoDetails(returnItemsWithFifo);
      setShowReturnDetailsModal(true);
    } catch (err) {
      console.error("Error fetching return details:", err);
      Swal.fire("Error", "Failed to load return details", "error");
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportData = filteredPurchases.map(p => ({
      "Invoice #": p.invoice_number,
      "Date": p.date,
      "Supplier": getSupplierName(p.supplier_id),
      "Total Amount": p.total_amount,
      "Discount (%)": p.discount || 0,
      "Tax (%)": p.tax || 0,
      "Payment Type": p.payment_type || "Cash Down",
      "Credit Option": p.credit_option || "-",
      "Status": p.status,
      "Notes": p.notes || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Purchase Orders");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, `Purchase_Orders_${today}.xlsx`);
  };

  // Calculate totals
  const totalAmount = filteredPurchases.reduce((sum, p) => {
    const items = p._items || [];
    if (items.length === 0) return sum + (currentValues[p.id] || 0);

    const purchaseTotal = items.reduce((itemSum, item) => {
      const beforeQty = parseFloat(item.original_qty || item.qty) || 0;
      const focQty = parseFloat(item.foc_qty) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const billableQty = beforeQty - focQty;
      return itemSum + (billableQty * unitPrice);
    }, 0);
    return sum + purchaseTotal;
  }, 0);
  const totalCount = filteredPurchases.length;
  const pendingCount = filteredPurchases.filter(p => p.status === "pending" || !p.status).length;
  const receivedCount = filteredPurchases.filter(p => p.status === "received").length;
  const cancelledCount = filteredPurchases.filter(p => p.status === "cancelled").length;
  const returnedCount = filteredPurchases.filter(p => p.status === "returned").length;

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-amber-100 text-amber-700",
      received: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-rose-100 text-rose-700",
      returned: "bg-violet-100 text-violet-700"
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>{status || "pending"}</span>;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Report</h1>
          <p className="text-sm text-slate-500 mt-1">View purchase order reports</p>
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

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date Filter</label>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {filterType === "custom" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Search</label>
            <input
              type="text"
              placeholder="Search by invoice or supplier..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Orders</div>
          <div className="text-2xl font-bold text-slate-800">{totalCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Pending</div>
          <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Received</div>
          <div className="text-2xl font-bold text-emerald-600">{receivedCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Cancelled</div>
          <div className="text-2xl font-bold text-rose-600">{cancelledCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500">Total Amount</div>
          <div className="text-2xl font-bold text-indigo-600">{formatMMK(totalAmount)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Discount</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Tax</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Payment</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredPurchases.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No purchase records found</td></tr>
            ) : (
              paginatedPurchases.map((purchase) => (
                <tr key={purchase.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <button onClick={() => viewDetails(purchase)} className="text-indigo-600 hover:text-indigo-800 underline">
                      {purchase.invoice_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{purchase.date}</td>
                  <td className="px-4 py-3 text-slate-600">{getSupplierName(purchase.supplier_id)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 font-medium">{formatMMK(calculateTotal(purchase))}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{purchase.discount ? `${purchase.discount}%` : "-"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{purchase.tax ? `${purchase.tax}%` : "-"}</td>
                  <td className="px-4 py-3 text-center text-slate-600">
                    {purchase.payment_type === "Credit" && purchase.credit_option
                      ? `Credit (${purchase.credit_option})`
                      : purchase.payment_type || "Cash Down"}
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(purchase.status)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => viewDetails(purchase)} className="text-indigo-600 hover:text-indigo-800 font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Previous</button>
          <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Next</button>
        </div>
      )}

      {/* Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Purchase Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
              <div><span className="text-slate-500">Status:</span><span className="ml-2">{getStatusBadge(selectedPurchase?.status)}</span></div>
              {selectedPurchase?.discount > 0 && (
                <div><span className="text-slate-500">Discount:</span><span className="ml-2 text-red-600">{selectedPurchase?.discount}%</span></div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Before Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">FOC Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Returned Qty</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Expiry Date</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map((item, idx) => {
                    const beforeQty = item.original_qty || item.qty;
                    const focQty = item.foc_qty || 0;
                    const returnedQty = getReturnedQty(beforeQty, item.qty);
                    const unitPrice = item.unit_price || 0;
                    // Total = (Before Qty - FOC Qty) × Unit Price
                    const total = (beforeQty - focQty) * unitPrice;
                    return (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                        <td className="px-4 py-2 text-center text-slate-600">{beforeQty}</td>
                        <td className="px-4 py-2 text-center">
                          {focQty > 0 ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{focQty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {returnedQty < 0 ? (
                            <span className="text-rose-600 font-semibold">{returnedQty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">{formatMMK(unitPrice)}</td>
                        <td className="px-4 py-2 text-center">
                          {item.expiry_date ? (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              new Date(item.expiry_date) <= new Date()
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {item.expiry_date}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-emerald-600">{formatMMK(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={7} className="px-4 py-2 text-right font-bold text-slate-800">Total</td>
                    <td className="px-4 py-2 text-right font-bold text-emerald-600">
                      {formatMMK(purchaseItems.reduce((sum, item) => {
                        const beforeQty = item.original_qty || item.qty;
                        const focQty = item.foc_qty || 0;
                        const unitPrice = item.unit_price || 0;
                        const billableQty = beforeQty - focQty;
                        return sum + (billableQty * unitPrice);
                      }, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selectedPurchase?.notes && <div className="mt-4 text-sm"><span className="text-slate-500">Notes:</span><p className="text-slate-700 mt-1">{selectedPurchase.notes}</p></div>}
            <div className="flex justify-end mt-4 gap-2">
              {selectedPurchase?.status === "returned" && (
                <button
                  onClick={() => viewReturnDetails(selectedPurchase)}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
                >
                  View Return Details
                </button>
              )}
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Return Details Modal with FIFO Breakdown */}
      {showReturnDetailsModal && selectedReturn && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Return Details - FIFO Breakdown</h3>
                <p className="text-sm text-slate-500">Purchase: {selectedReturn.purchase?.invoice_number}</p>
              </div>
              <button
                onClick={() => setShowReturnDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                X
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Invoice #:</span>
                <span className="ml-2 font-semibold">{selectedReturn.purchase?.invoice_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Date:</span>
                <span className="ml-2">{selectedReturn.purchase?.date}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className="ml-2">{getStatusBadge(selectedReturn.purchase?.status)}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Return #</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Return Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-700">Total</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">Status</th>
                    <th className="px-3 py-2 text-center font-semibold text-slate-700">FIFO Details</th>
                  </tr>
                </thead>
                <tbody>
                  {returnFifoDetails.map((retItem, idx) => {
                    const isFullReturn = retItem.qty >= (retItem.original_qty || retItem.qty);
                    return (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {retItem.returnInfo?.return_number || "-"}
                        </td>
                        <td className="px-3 py-2 text-slate-800 font-medium">{retItem.item_name}</td>
                        <td className="px-3 py-2 text-center text-slate-600">{retItem.type || "-"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            isFullReturn
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {retItem.qty}
                            {!isFullReturn && " (Partial)"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">{formatMMK(retItem.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{formatMMK(retItem.total_price)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            retItem.returnInfo?.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}>
                            {retItem.returnInfo?.status || "pending"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800">
                              {retItem.fifoDetails?.length || 0} layer(s)
                            </summary>
                            <div className="mt-2 text-left bg-slate-50 p-2 rounded">
                              {retItem.fifoDetails && retItem.fifoDetails.length > 0 ? (
                                retItem.fifoDetails.map((fifo, fIdx) => (
                                  <div key={fIdx} className="text-xs py-1 border-b border-slate-200 last:border-0">
                                    <div className="flex justify-between">
                                      <span className="text-slate-600">Source: {fifo.source_type}</span>
                                      <span className="font-medium">{fifo.qty_reduced} @ {formatMMK(fifo.unit_price)}</span>
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
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-right font-bold text-slate-800">Total Returned</td>
                    <td className="px-3 py-2 text-right font-bold text-violet-600">
                      {formatMMK(returnFifoDetails.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowReturnDetailsModal(false)}
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
                <h3 className="text-xl font-bold text-slate-800">Purchase Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-purchase-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;

                    const statusBadgeStyle = (status) => {
                      const s = {
                        pending: 'background:#fef3c7;color:#b45309;',
                        received: 'background:#d1fae5;color:#047857;',
                        cancelled: 'background:#ffe4e6;color:#e11d48;',
                        returned: 'background:#ede9fe;color:#7c3aed;'
                      };
                      return s[status] || s.pending;
                    };

                    let tableRows = filteredPurchases.map(p => {
                      const totalVal = calculateTotal(p);
                      const statusStyle = statusBadgeStyle(p.status);
                      return `<tr>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">${p.invoice_number || '-'}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">${p.date}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;">${getSupplierName(p.supplier_id)}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${formatMMK(totalVal)}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.discount ? p.discount + '%' : '-'}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:right;">${p.tax ? p.tax + '%' : '-'}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:center;">${p.payment_type === 'Credit' && p.credit_option ? 'Credit (' + p.credit_option + ')' : (p.payment_type || 'Cash Down')}</td>
                        <td style="padding:10px 16px;border-bottom:1px solid #e2e8f0;text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;${statusBadgeStyle(p.status || 'pending')}">${p.status || 'pending'}</span></td>
                      </tr>`;
                    }).join('');

                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Purchase Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
                            .brand { font-size: 14px; color: #4f46e5; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 11px; }
                            th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
                            th { background: #f1f5f9; font-weight: 600; }
                            .text-right { text-align: right; }
                            .summary { margin: 16px 0; display: flex; gap: 16px; flex-wrap: wrap; }
                            .summary-card { padding: 8px 16px; background: #f8fafc; border-radius: 8px; }
                            .summary-label { font-size: 11px; color: #64748b; }
                            .summary-value { font-size: 16px; font-weight: 700; }
                            @page { size: auto; margin: 10mm; }
                            @media print { body { padding: 0; } }
                          </style>
                        </head>
                        <body>
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
              <div id="print-purchase-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Purchase Report</h1>
                <p className="text-sm text-slate-500 mb-4">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                {/* Table - all filtered purchases (no pagination) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Discount</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Tax</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Payment</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchases.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No purchase records found</td></tr>
                      ) : (
                        filteredPurchases.map((purchase) => (
                          <tr key={purchase.id} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                            <td className="px-4 py-3 font-semibold text-slate-800">{purchase.invoice_number}</td>
                            <td className="px-4 py-3 text-slate-600">{purchase.date}</td>
                            <td className="px-4 py-3 text-slate-600">{getSupplierName(purchase.supplier_id)}</td>
                            <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatMMK(calculateTotal(purchase))}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{purchase.discount ? `${purchase.discount}%` : '-'}</td>
                            <td className="px-4 py-3 text-right text-slate-600">{purchase.tax ? `${purchase.tax}%` : '-'}</td>
                            <td className="px-4 py-3 text-center text-slate-600">
                              {purchase.payment_type === 'Credit' && purchase.credit_option
                                ? `Credit (${purchase.credit_option})`
                                : purchase.payment_type || 'Cash Down'}
                            </td>
                            <td className="px-4 py-3 text-center">{getStatusBadge(purchase.status)}</td>
                          </tr>
                        ))
                      )}
                      {/* Summary row */}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td colSpan={3} className="px-4 py-3 text-right text-slate-700">TOTAL</td>
                        <td className="px-4 py-3 text-right text-indigo-700">{formatMMK(totalAmount)}</td>
                        <td colSpan={4}></td>
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