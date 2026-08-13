import { useState, useEffect, Fragment } from "react";
import { useLocation } from "react-router-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function SupplierOutstanding() {
  const location = useLocation();
  const isReportOnlyView = location.pathname === "/reports/supplier-outstanding";
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(isReportOnlyView ? "all" : "unpaid");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState([]);
  const [purchaseItemsMap, setPurchaseItemsMap] = useState({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        supabase.from("purchases").select("*").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").order("name", { ascending: true })
      ]);

      if (!purchasesRes.error) setPurchases(purchasesRes.data || []);
      if (!suppliersRes.error) setSuppliers(suppliersRes.data || []);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Calculate supplier report by payment status
  const supplierOutstanding = () => {
    const creditPurchases = purchases.filter(p => {
      // Date filter
      let matchesDate = true;
      if (dateFilter !== "all" && p.date) {
        const purchaseDate = new Date(p.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === "day") {
          const dayStart = new Date(today);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(today);
          dayEnd.setHours(23, 59, 59, 999);
          matchesDate = purchaseDate >= dayStart && purchaseDate <= dayEnd;
        } else if (dateFilter === "week") {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          weekStart.setHours(0, 0, 0, 0);
          matchesDate = purchaseDate >= weekStart;
        } else if (dateFilter === "month") {
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDate = purchaseDate >= monthStart;
        } else if (dateFilter === "year") {
          const yearStart = new Date(today.getFullYear(), 0, 1);
          matchesDate = purchaseDate >= yearStart;
        } else if (dateFilter === "custom" && customDateRange.start && customDateRange.end) {
          const start = new Date(customDateRange.start);
          const end = new Date(customDateRange.end);
          end.setHours(23, 59, 59, 999);
          matchesDate = purchaseDate >= start && purchaseDate <= end;
        }
      }

      const total = parseFloat(p.total_amount) || 0;
      const paidAmount = parseFloat(p.paid_amount) || 0;
      const remaining = Math.max(total - paidAmount, 0);
      const isFullyPaid = remaining <= 0;
      const matchesPaymentStatus =
        paymentStatusFilter === "all"
        ? true
        : paymentStatusFilter === "paid"
          ? isFullyPaid
          : !isFullyPaid;

      return matchesDate && p.payment_type === "Credit" && p.status !== "cancelled" && matchesPaymentStatus;
    });

    const supplierData = {};

    creditPurchases.forEach(p => {
      const supId = p.supplier_id;
      const total = parseFloat(p.total_amount) || 0;
      const paidAmount = parseFloat(p.paid_amount) || 0;
      const remaining = Math.max(total - paidAmount, 0);

      if (!supplierData[supId]) {
        supplierData[supId] = { name: getSupplierName(supId), total: 0, paid: 0, count: 0, purchases: [] };
      }
      const invoicePaid = remaining <= 0;
      supplierData[supId].total += remaining;
      supplierData[supId].paid += paidAmount;
      supplierData[supId].count += 1;
      supplierData[supId].purchases.push({
        ...p,
        paid_amount: paidAmount,
        remaining_amount: remaining,
        total_amount: total,
        invoicePaid,
        invoiceStatus: invoicePaid ? 'Paid' : 'Unpaid'
      });
    });

    return Object.entries(supplierData)
      .map(([id, data]) => ({
        supplier_id: parseInt(id),
        supplier_name: data.name,
        total_payable: data.total,
        total_paid: data.paid,
        purchase_count: data.count,
        purchases: data.purchases
      }))
      .sort((a, b) => b.total_payable - a.total_payable);
  };

  const outstandingData = supplierOutstanding();

  const filteredData = outstandingData.filter(s =>
    s.supplier_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalOutstanding = filteredData.reduce((sum, s) => sum + (paymentStatusFilter === 'paid' ? s.total_paid : s.total_payable), 0);
  const totalLabel = paymentStatusFilter === "paid"
    ? "Total Paid"
    : "Total Outstanding";

  const toggleExpand = (supplierId) => {
    setExpandedSuppliers(prev => {
      const next = { ...prev, [supplierId]: !prev[supplierId] };
      // if expanding, prefetch items for purchases of this supplier
      const supplier = outstandingData.find(s => s.supplier_id === supplierId);
      if (!prev[supplierId] && supplier) {
        supplier.purchases.forEach(p => fetchPurchaseItems(p.id));
      }
      return next;
    });
  };

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });
    setSelectedPurchase(purchase);
    setSelectedPurchaseItems(items || []);
    setShowDetailModal(true);
  };
  
  const fetchPurchaseItems = async (purchaseId) => {
    if (purchaseItemsMap[purchaseId]) return;
    try {
      const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchaseId).order("id", { ascending: true });
      setPurchaseItemsMap((m) => ({ ...m, [purchaseId]: items || [] }));
    } catch (err) {
      console.error("Error fetching purchase items:", err);
    }
  };

  const handlePay = async (purchase) => {
    // open payment modal for partial/full payment
    // ensure we normalize values for partial payments
    const normalized = {
      ...purchase,
      paid_amount: Number(purchase.paid_amount) || 0,
      total_amount: Number(purchase.total_amount) || 0,
      paid: !!purchase.paid
    };
    setSelectedPurchase(normalized);
    // ensure we have items for small inline preview
    fetchPurchaseItems(purchase.id);
    setPaymentAmount('');
    setShowPaymentModal(true);
  };

  const selectedPurchaseTotal = Number(selectedPurchase?.total_amount) || 0;
  const selectedPurchasePaid = Number(selectedPurchase?.paid_amount) || 0;
  const selectedPurchaseRemaining = Math.max(selectedPurchaseTotal - selectedPurchasePaid, 0);
  const selectedPurchaseRemainingAfterPayment = Math.max(selectedPurchaseRemaining - (Number(paymentAmount) || 0), 0);

  const processPayment = async () => {
    if (!selectedPurchase) return;
    const total = Number(selectedPurchase.total_amount) || 0;
    const existingPaid = Number(selectedPurchase.paid_amount) || 0;
    const pay = Number(paymentAmount) || 0;
    if (pay <= 0) {
      Swal.fire('Error', 'Enter a valid payment amount', 'error');
      return;
    }
    if (pay + existingPaid > total) {
      Swal.fire('Error', 'Payment exceeds invoice total', 'error');
      return;
    }
    setPaymentProcessing(true);
    try {
      const newPaid = existingPaid + pay;
      const remaining = total - newPaid;
      const updatePayload = {
        paid_amount: newPaid,
        paid: remaining <= 0,
        status: remaining <= 0 ? 'received' : selectedPurchase.status || 'pending'
      };

      const { data: updatedPurchase, error: updateError } = await supabase.from('purchases').update(updatePayload).eq('id', selectedPurchase.id).select().single();
      if (updateError) {
        throw updateError;
      }

      setSelectedPurchase((prev) => ({
        ...prev,
        paid_amount: newPaid,
        remaining_amount: remaining,
        paid: remaining <= 0,
        status: remaining <= 0 ? 'received' : 'pending'
      }));

      Swal.fire('Success', `Payment recorded. Remaining ${formatMMK(remaining)}`, 'success');
      setShowPaymentModal(false);
      fetchData();
    } catch (err) {
      console.error('Payment error:', err);
      Swal.fire('Error', err.message || 'Failed to process payment', 'error');
    } finally {
      setPaymentProcessing(false);
    }
  };

  const exportToExcel = () => {
    const exportData = [];
    filteredData.forEach(s => {
      s.purchases.forEach(p => {
        exportData.push({
          "Supplier Name": s.supplier_name,
          "Invoice #": p.invoice_number,
          "Date": p.date,
          "Payment Term": p.credit_option || "-",
          "Paid Status": p.invoiceStatus,
          "Remaining Amount": p.remaining_amount
        });
      });
      exportData.push({
        "Supplier Name": s.supplier_name + " (Total)",
        "Invoice #": "-",
        "Date": "-",
        "Payment Term": "-",
        "Paid Status": "-",
        "Amount": s.total_payable
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Supplier Outstanding");

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const today = new Date().toISOString().split("T")[0];
    saveAs(fileData, `Supplier_Outstanding_${today}.xlsx`);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supplier Outstanding</h1>
          <p className="text-sm text-slate-500 mt-1">Credit purchase paid status report</p>
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

      {!isReportOnlyView && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by supplier name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Date</option>
            </select>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="all">All Status</option>
            </select>
            {dateFilter === "custom" && (
              <div className="flex gap-2">
                <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {isReportOnlyView && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by supplier name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="all">All Time</option>
              <option value="day">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Date</option>
            </select>
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
            </select>
            {dateFilter === "custom" && (
              <div className="flex gap-2">
                <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {!isReportOnlyView && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Total Suppliers</div>
            <div className="text-2xl font-bold text-slate-800">{filteredData.length}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Total Invoices</div>
            <div className="text-2xl font-bold text-amber-600">{filteredData.reduce((sum, s) => sum + s.purchase_count, 0)}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="text-sm text-slate-500">{totalLabel}</div>
            <div className="text-2xl font-bold text-indigo-600">{formatMMK(totalOutstanding)}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier Name</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Orders</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Remaining Pay</th>
              {!isReportOnlyView && <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isReportOnlyView ? 4 : 5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={isReportOnlyView ? 4 : 5} className="px-4 py-8 text-center text-slate-500">No credit purchases for selected filters</td></tr>
            ) : (
              filteredData.map((sup) => (
                <Fragment key={sup.supplier_id}>
                  <tr className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleExpand(sup.supplier_id)}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        {expandedSuppliers[sup.supplier_id] ? "−" : "+"}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{sup.supplier_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{sup.purchase_count}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">{formatMMK(sup.total_payable)}</td>
                  </tr>
                  {expandedSuppliers[sup.supplier_id] && sup.purchases.map((p) => (
                    <tr key={p.id} className="bg-slate-50 border-t border-slate-200">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 pl-10 text-slate-600">
                        <button onClick={() => viewDetails(p)} className="font-medium text-indigo-600 hover:text-indigo-800 underline">{p.invoice_number}</button>
                        <span className="ml-2 text-slate-400">| {p.date}</span>
                        {purchaseItemsMap[p.id] && purchaseItemsMap[p.id].length > 0 && (
                          <div className="text-xs text-slate-500 mt-1">
                            {purchaseItemsMap[p.id].slice(0,3).map((it, i) => (
                              <span key={it.id} className="mr-2">
                                {it.item_name} x{it.qty} @ {formatMMK(it.unit_price)} = {formatMMK(it.total_price)}{i < Math.min(2, purchaseItemsMap[p.id].length - 1) ? ',' : ''}
                              </span>
                            ))}
                            {purchaseItemsMap[p.id].length > 3 && <span> +{purchaseItemsMap[p.id].length - 3} more</span>}
                            <div className="mt-1">Invoice Total: <span className="font-semibold">{formatMMK(p.total_amount)}</span></div>
                            <div className="mt-1">Remaining Pay: <span className="font-semibold">{formatMMK(p.remaining_amount)}</span></div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.invoicePaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {p.invoiceStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{formatMMK(p.remaining_amount)}</td>
                      {!isReportOnlyView && (
                        <td className="px-4 py-2 text-right">
                          {!p.invoicePaid && (
                            <button
                              onClick={() => handlePay(p)}
                              className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Pay
                            </button>
                          )}
                          {p.invoicePaid && <span className="text-emerald-600 text-xs font-medium">Completed</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

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
              <div><span className="text-slate-500">Status:</span><span className="ml-2">{selectedPurchase?.status}</span></div>
              {selectedPurchase?.discount > 0 && (
                <div><span className="text-slate-500">Discount:</span><span className="ml-2 text-red-600">{selectedPurchase?.discount}%</span></div>
              )}
              {selectedPurchase?.tax > 0 && (
                <div><span className="text-slate-500">Tax:</span><span className="ml-2 text-blue-600">{selectedPurchase?.tax}%</span></div>
              )}
              <div><span className="text-slate-500">Payment:</span><span className="ml-2 font-medium">{selectedPurchase?.payment_type || "Cash Down"}</span></div>
              {selectedPurchase?.payment_type === "Credit" && selectedPurchase?.credit_option && (
                <div><span className="text-slate-500">Credit:</span><span className="ml-2 font-medium">{selectedPurchase?.credit_option}</span></div>
              )}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchaseItems.length > 0 ? selectedPurchaseItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500">No items found</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right font-bold text-slate-800">Grand Total</td>
                    <td className="px-4 py-2 text-right font-bold text-indigo-600">{formatMMK(selectedPurchase?.total_amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selectedPurchase?.notes && <div className="mt-4 text-sm"><span className="text-slate-500">Notes:</span><p className="text-slate-700 mt-1">{selectedPurchase.notes}</p></div>}
          </div>
        </div>
      )}

      {/* Payment Modal (partial/full payments) */}
      {showPaymentModal && selectedPurchase && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">Pay Invoice {selectedPurchase.invoice_number}</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">X</button>
            </div>

            <div className="mb-4 text-sm">
              <div className="flex justify-between"><div className="text-slate-500">Invoice Total</div><div className="font-semibold">{formatMMK(selectedPurchase.total_amount)}</div></div>
              <div className="flex justify-between mt-2"><div className="text-slate-500">Already Paid</div><div className="font-semibold">{formatMMK(Number(selectedPurchase.paid_amount) || 0)}</div></div>
              <div className="flex justify-between mt-2"><div className="text-slate-500">Remaining</div><div className="font-semibold">{formatMMK((Number(selectedPurchase.total_amount) || 0) - (Number(selectedPurchase.paid_amount) || 0))}</div></div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-slate-600">Amount to Pay</label>
              <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg" />
              <div className="flex justify-between mt-2 text-sm text-slate-600">
                <div>Remaining after payment</div>
                <div className="font-semibold">{formatMMK(selectedPurchaseRemainingAfterPayment)}</div>
              </div>
            </div>

            {/* small items preview if available */}
            {purchaseItemsMap[selectedPurchase.id] && purchaseItemsMap[selectedPurchase.id].length > 0 && (
              <div className="border border-slate-200 rounded-lg p-2 mb-4 text-sm">
                <div className="text-slate-500 mb-1">Items</div>
                {purchaseItemsMap[selectedPurchase.id].slice(0,5).map((it) => (
                  <div key={it.id} className="flex justify-between text-slate-700">
                    <div>{it.item_name} x{it.qty} {it.type ? `(${it.type})` : ''}</div>
                    <div className="font-medium">{formatMMK(it.unit_price)}</div>
                  </div>
                ))}
                {purchaseItemsMap[selectedPurchase.id].length > 5 && <div className="text-xs text-slate-400 mt-1">{purchaseItemsMap[selectedPurchase.id].length - 5} more items...</div>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
              <button onClick={processPayment} disabled={paymentProcessing} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">{paymentProcessing ? 'Processing...' : 'Confirm Payment'}</button>
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
                <h3 className="text-xl font-bold text-slate-800">Supplier Outstanding Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-supplier-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Supplier Outstanding Report</title>
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
                            .badge-green { background: #dcfce7; color: #16a34a; }
                            .badge-amber { background: #fef3c7; color: #d97706; }
                            .emerald { color: #059669; }
                            .amber { color: #d97706; }
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
              <div id="print-supplier-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Supplier Outstanding Report</h1>
                <p className="text-sm text-slate-500 mb-4">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier Name</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Orders</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Amount</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.length === 0 ? (
                        <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                      ) : (
                        filteredData.map((sup) => (
                          <Fragment key={sup.supplier_id}>
                            {/* Supplier row */}
                            <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                              <td className="px-4 py-3 text-slate-800">{sup.supplier_name}</td>
                              <td className="px-4 py-3 text-center text-slate-700">{sup.purchase_count}</td>
                              <td className="px-4 py-3 text-right text-amber-600">{formatMMK(sup.total_payable)}</td>
                              <td colSpan="4"></td>
                            </tr>
                            {/* Purchase rows */}
                            {sup.purchases.map((p) => (
                              <tr key={p.id} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                                <td className="px-4 py-3 text-slate-500 pl-8"></td>
                                <td className="px-4 py-3 text-center text-slate-600"></td>
                                <td className="px-4 py-3 text-right text-slate-600"></td>
                                <td className="px-4 py-3 text-slate-700">{p.invoice_number}</td>
                                <td className="px-4 py-3 text-slate-600">{p.date}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    p.invoicePaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {p.invoiceStatus}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-slate-700 font-medium">{formatMMK(p.remaining_amount)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))
                      )}
                      {/* Total row */}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td colSpan="2" className="px-4 py-3 text-right text-slate-700">{totalLabel}</td>
                        <td className="px-4 py-3 text-right text-indigo-600">{formatMMK(totalOutstanding)}</td>
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
