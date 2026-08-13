import { useEffect, useState } from "react";
import supabase from "../createClients";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function TotalSalesReport() {
  const [orderItems, setOrderItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Preset filter: "all", "day", "week", "month", "year"
  const [presetFilter, setPresetFilter] = useState("all");

  // Payment type filter: "all", "Cash", "Kpay", "FOC", "Coupon"
  const [paymentFilter, setPaymentFilter] = useState("all");

  // Custom date range
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const printedByName = currentUser?.full_name || currentUser?.username || currentUser?.id || "Unknown";

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log("TotalSalesReport.fetchData: start");
      // Fetch orders for report, then filter completed/cancelled locally to avoid case mismatch issues
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(0, 9999);
      if (ordersErr) throw ordersErr;

      const orderIds = (ordersData || []).map((o) => String(o.id));

      // Fetch order items for selected orders in chunks (Supabase defaults to 100 rows)
      let items = [];
      if (orderIds.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < orderIds.length; i += chunkSize) {
          const chunk = orderIds.slice(i, i + chunkSize).map((id) => Number(id));
          const { data: chunkData, error: chunkErr } = await supabase
            .from("order_items")
            .select("*")
            .in("order_id", chunk)
            .order("id", { ascending: true })
            .range(0, 9999);
          if (chunkErr) throw chunkErr;
          items = items.concat(chunkData || []);
        }
      }

      // Targeted debug: explicitly query order_items for slip 1296 if not present
      try {
        const has1296 = (items || []).some(it => Number(it.order_id) === 1296);
        if (!has1296) {
          const { data: single1296, error: singleErr } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', 1296);
          console.log('TotalSalesReport: direct fetch for order_items where order_id=1296', { rows: (single1296 || []).length, error: singleErr, sample: (single1296 || []).slice(0,5) });
        }
      } catch (err) {
        console.error('TotalSalesReport: direct fetch 1296 failed', err);
      }

      const { data: menuData, error: menuErr } = await supabase.from("menu").select("id, menu_name").range(0, 9999);
      if (menuErr) throw menuErr;

      const { data: menuSetsData, error: setsErr } = await supabase.from("menu_sets").select("id, set_name").range(0, 9999);
      if (setsErr) throw setsErr;

      // Fetch users to map cancelled_by and completed_by
      const { data: usersData } = await supabase.from("user").select("id, full_name").range(0, 9999);
      const uMap = {};
      (usersData || []).forEach((u) => {
        uMap[u.id] = u;
      });
      setUserMap(uMap);

      setOrders(ordersData || []);
      setMenus(menuData || []);

      const merged = (items || []).map((item) => {
        const itemOrderId = Number(item.order_id);
        const order = (ordersData || []).find((o) => o.id === itemOrderId);
        let menu_name = item.menu_name || "Unknown";
        let isSet = false;

        if (item.menu_set_id) {
          const menuSet = (menuSetsData || []).find((s) => String(s.id) === String(item.menu_set_id));
          menu_name = menu_name !== "Unknown" ? menu_name : menuSet?.set_name || "Unknown Set";
          isSet = true;
        } else {
          const menu = (menuData || []).find((m) => String(m.id) === String(item.menu_id));
          menu_name = menu_name !== "Unknown" ? menu_name : menu?.menu_name || "Unknown";
        }

        const qty = toNumber(item.qty);
        const price = toNumber(item.price);
        const original_price = item.original_price != null ? toNumber(item.original_price, null) : null;

        if (qty < 0) {
          console.warn("Negative order item qty in TotalSalesReport:", item.order_id, item.menu_name, qty);
        }

        return {
          ...item,
          order_id: itemOrderId,
          qty,
          price,
          original_price,
          status: order?.status || null,
          total: toNumber(order?.total),
          discount_percent: toNumber(order?.discount_percent),
          created_at: order?.created_at,
          menu_name,
          discount_type: order?.discount_type || null,
          isSet,
          payment_type: order?.payment_type || "cash",
          remark: order?.remark || null,
          cancel_note: order?.cancel_note || null,
          cancelled_by: order?.cancelled_by || null,
          cancelled_at: order?.cancelled_at || null,
          cancelled_by_name: uMap[order?.cancelled_by]?.full_name || null,
          completed_by: order?.completed_by || null,
          completed_at: order?.completed_at || null,
          completed_by_name: uMap[order?.completed_by]?.full_name || null,
        };
      });

      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      // More visible logs
      try {
        console.log("TotalSalesReport: orders fetched", (ordersData || []).length, "orderItems fetched", (items || []).length);
        console.log("TotalSalesReport: orderIds sample", (orderIds || []).slice(0, 20));
        console.log("TotalSalesReport: order statuses sample", (ordersData || []).slice(0, 20).map(o => ({ id: o.id, status: o.status })));
        console.log("TotalSalesReport: unique orderIds in items", new Set((items || []).map(it => String(it.order_id))).size);
        console.log("TotalSalesReport: ordersData has 1296?", (ordersData || []).some(o => Number(o.id) === 1296));
        console.log("TotalSalesReport: order_items has 1296?", (items || []).some(it => Number(it.order_id) === 1296));
        console.log("TotalSalesReport: merged has 1296?", merged.some(m => Number(m.order_id) === 1296));
      } catch (e) {
        console.error("TotalSalesReport debug log failed", e);
      }
      setOrderItems(merged);
    } catch (err) {
      console.error("Error fetching data:", err);
      setOrderItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const now = new Date();

  const filteredOrders = orders
    .filter((order) => String(order.status || "").toLowerCase() === "completed")
    .filter((order) => {
      const date = new Date(order.created_at);

      // Custom filter has priority
      if (customStart && customEnd) {
        const start = new Date(customStart);
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      }

      // Preset filters
      switch (presetFilter) {
        case "day":
          return (
            date.getDate() === now.getDate() &&
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear()
          );
        case "week": {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return date >= weekAgo;
        }
        case "month":
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        case "year":
          return date.getFullYear() === now.getFullYear();
        default:
          return true;
      }
    })
    .filter((order) => {
      if (paymentFilter === "all") return true;
      return (order.payment_type || "Cash") === paymentFilter;
    })
    .filter((order) => {
      const searchLower = search.toLowerCase().trim();
      if (!searchLower) return true;

      const orderMatches = String(order.id).includes(searchLower);
      const itemMatches = orderItems.some(
        (item) => String(item.order_id) === String(order.id) && item.menu_name?.toLowerCase().includes(searchLower)
      );

      return orderMatches || itemMatches;
    });

  const filteredOrderIds = new Set(filteredOrders.map((order) => String(order.id)));
  const filteredItems = orderItems.filter((item) => filteredOrderIds.has(String(item.order_id)));

  // Group orders by slip (order_id), including orders with no order items
  const groupedBySlip = () => {
    const groups = {};
    const itemsByOrder = {};

    filteredItems.forEach((item) => {
      const orderId = Number(item.order_id);
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
      itemsByOrder[orderId].push(item);
    });

    filteredOrders.forEach((order) => {
      const itemsForOrder = itemsByOrder[order.id] || [];
      groups[order.id] = {
        order_id: order.id,
        menus: [],
        qty: 0,
        price: 0,
        item_total: 0,
        subtotal: 0,
        item_discount: 0,
        discount_amount: toNumber(order?.discount_amount),
        discount_percent: toNumber(order?.discount_percent),
        discount_type: order?.discount_type || null,
        tax_amount: toNumber(order?.tax_amount),
        total: toNumber(order?.total),
        status: order?.status || null,
        payment_type: order?.payment_type || "Cash",
        remark: order?.remark || null,
        created_at: order.created_at,
        cancel_note: order?.cancel_note || null,
        cancelled_by: order?.cancelled_by || null,
        cancelled_at: order?.cancelled_at || null,
        cancelled_by_name: userMap[order?.cancelled_by]?.full_name || null,
        completed_by: order?.completed_by || null,
        completed_at: order?.completed_at || null,
        completed_by_name: userMap[order?.completed_by]?.full_name || null,
      };

      itemsForOrder.forEach((item) => {
        groups[order.id].menus.push({ menu_name: item.menu_name, qty: item.qty, price: item.price, original_price: item.original_price, isSet: item.isSet });
        groups[order.id].qty += toNumber(item.qty);
        groups[order.id].price += toNumber(item.price);
        if (item.original_price != null) {
          groups[order.id].item_discount += (toNumber(item.original_price) - toNumber(item.price)) * toNumber(item.qty);
        }
        groups[order.id].item_total += toNumber(item.qty) * toNumber(item.price);
        groups[order.id].subtotal += (item.original_price != null ? toNumber(item.original_price) : toNumber(item.price)) * toNumber(item.qty);
      });
    });

    return Object.values(groups).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  const slipData = groupedBySlip();

  // Pagination
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = slipData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(slipData.length / rowsPerPage);

  // Calculate totals from slip data
  const getOrderTotals = () => {
    // Totals are calculated for completed orders only
    const totalSlips = slipData.filter((s) => s.status === "completed");

    const totalSubtotal = totalSlips.reduce((sum, s) => sum + (s.subtotal || 0), 0);
    const totalDiscount = totalSlips.reduce((sum, s) => sum + ((s.discount_amount || 0) + (s.item_discount || 0)), 0);
    const totalTax = totalSlips.reduce((sum, s) => sum + (s.tax_amount || 0), 0);
    const grandTotal = totalSlips.reduce((sum, s) => sum + (s.total || 0), 0);

    return { totalSubtotal, totalDiscount, totalTax, grandTotal };
  };

  const { totalSubtotal, totalDiscount, totalTax, grandTotal } = getOrderTotals();

  const exportToExcel = () => {
      const exportData = slipData.map((slip) => {
      const menusText = slip.menus.map(m => `${m.menu_name}${m.isSet ? ' (Set)' : ''} x${m.qty}`).join(", ");
      const paymentText = slip.payment_type === "Cash" ? "Cash" : slip.payment_type === "Kpay" ? "Kpay" : slip.payment_type === "Coupon" ? "Coupon" : "FOC";
      const completeText = slip.completed_by_name || slip.completed_by || "";
      const displayRemark = slip.remark || "";
      return {
        Slip_ID: slip.order_id,
        Menu: menusText,
        Qty: slip.qty,
        Subtotal: slip.subtotal,
        Discount: slip.discount_amount + slip.item_discount,
        Tax: slip.tax_amount,
        Grand_Total: slip.total,
        Payment: paymentText,
        Completed: completeText,
        Remark: displayRemark,
        Date: slip.created_at,
      };
    });

    // Add total row
    exportData.push({
      Slip_ID: "",
      Menu: "TOTAL AMOUNT",
      Qty: "",
      Subtotal: totalSubtotal,
      Discount: totalDiscount,
      Tax: totalTax,
      Grand_Total: grandTotal,
      Payment: "",
      Remark: "",
      Date: "",
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(fileData, "Total_Sales_Report.xlsx");
  };

  return (
    <div className="p-6 min-h-screen bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Total Sales Report</h1>
          <p className="text-sm text-slate-500 mt-1">View sales report</p>
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

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          {/* Date Filter */}
          <select
            value={presetFilter}
            onChange={(e) => {
              setPresetFilter(e.target.value);
              setCustomStart("");
              setCustomEnd("");
              setCurrentPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Time</option>
            <option value="day">This Day</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Date</option>
          </select>

          {/* Custom Date Range */}
          {presetFilter === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border px-3 py-2 rounded-lg"
              />
              <span className="text-slate-500 self-center">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border px-3 py-2 rounded-lg"
              />
              <button
                onClick={() => setCurrentPage(1)}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg"
              >
                Apply
              </button>
            </>
          )}
          {/* (Status filter removed - showing completed orders only) */}
          {/* Payment Type Filter */}
          <span className="text-sm font-medium text-gray-700 self-center">Payment:</span>
          {["all", "Cash", "Kpay", "FOC", "Coupon"].map((p) => (
            <button
              key={p}
              onClick={() => {
                setPaymentFilter(p);
                setCurrentPage(1);
              }}
                className={`px-3 py-1.5 rounded-lg capitalize ${
                paymentFilter === p
                  ? p === "Cash" ? "bg-green-600 text-white" : p === "Kpay" ? "bg-blue-600 text-white" : p === "FOC" ? "bg-purple-600 text-white" : p === "Coupon" ? "bg-yellow-600 text-white" : "bg-blue-600 text-white"
                  : "bg-white border"
              }`}
            >
              {p}
            </button>
          ))}

          {/* Search */}
          <input
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Total sales */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-sm text-gray-500">Subtotal</p>
            <p className="text-lg font-semibold">{mmkFormatter.format(totalSubtotal)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Discount</p>
            <p className="text-lg font-semibold text-red-500">-{mmkFormatter.format(totalDiscount)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tax</p>
            <p className="text-lg font-semibold text-blue-500">+{mmkFormatter.format(totalTax)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Grand Total</p>
            <p className="text-xl font-bold text-green-600">{mmkFormatter.format(grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Slip ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Menu</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Qty</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Subtotal</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Discount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Tax</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Grand Total</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Payment</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Remark</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Completed</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="12" className="text-center py-6">Loading...</td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center py-6">No Data Found</td>
              </tr>
            ) : (
              currentData.map((slip) => {
                const paymentType = slip.payment_type || "Cash";
                const menusText = slip.menus.map((m, idx) => (
                  <span key={`${slip.order_id}-${idx}`}>
                    {m.menu_name}
                    {m.isSet && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">SET</span>}
                    {' x'}{m.qty}
                    {idx < slip.menus.length - 1 ? ', ' : ''}
                  </span>
                ));
                const displayRemark = slip.remark || "-";
                return (
                <tr key={slip.order_id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition">
                  <td className="px-4 py-3">{slip.order_id}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{menusText}</td>
                  <td className="px-4 py-3">{slip.qty}</td>
                  <td className="px-4 py-3">{mmkFormatter.format(slip.subtotal)}</td>
                  <td className="px-4 py-3 text-red-500">
                    {(() => {
                      if (slip.discount_amount === 0 && slip.item_discount === 0) return "-";
                      const parts = [];
                      if (slip.discount_amount > 0) {
                        parts.push(
                          <>
                            {mmkFormatter.format(slip.discount_amount)}
                            {slip.discount_type && <span className="ml-1 text-xs text-gray-400">{slip.discount_type}</span>}
                          </>
                        );
                      }
                      if (slip.item_discount > 0) {
                        parts.push(
                          <>
                            {slip.discount_amount > 0 ? "+ " : ""}
                            {mmkFormatter.format(slip.item_discount)}
                            <span className="ml-1 text-xs text-gray-400">Manual</span>
                          </>
                        );
                      }
                      return <div className="flex flex-col">{parts}</div>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-blue-500">{mmkFormatter.format(slip.tax_amount)}</td>
                  <td className="px-4 py-3 text-green-700 font-bold">{mmkFormatter.format(slip.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      paymentType === "Cash" ? "bg-green-100 text-green-800" : paymentType === "Kpay" ? "bg-blue-100 text-blue-800" : paymentType === "Coupon" ? "bg-yellow-100 text-yellow-800" : "bg-purple-100 text-purple-800"
                    }`}>
                      {paymentType === "Cash" ? "Cash" : paymentType === "Kpay" ? "Kpay" : paymentType === "Coupon" ? "Coupon" : "FOC"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{displayRemark}</td>
                  <td className="px-4 py-3 text-green-600">{slip.completed_by_name || slip.completed_by || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(slip.created_at).toLocaleDateString()}</td>
                </tr>
              );
              })
            )}
            {/* Summary row for main table */}
            {slipData.length > 0 && (
              <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                <td colSpan="3" className="px-4 py-3 text-right text-slate-700">TOTAL</td>
                <td className="px-4 py-3 text-right text-slate-700">{mmkFormatter.format(totalSubtotal)}</td>
                <td className="px-4 py-3 text-right text-red-600">-{mmkFormatter.format(totalDiscount)}</td>
                <td className="px-4 py-3 text-right text-blue-600">+{mmkFormatter.format(totalTax)}</td>
                <td className="px-4 py-3 text-right text-green-700">{mmkFormatter.format(grandTotal)}</td>
                <td colSpan="4"></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center p-4 bg-gray-50">
          <span className="text-sm">Page {currentPage} of {totalPages || 1}</span>
          <div className="space-x-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Preview & Print Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl shadow-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Total Sales Report</h3>
                <p className="text-sm text-slate-500">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-sales-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Total Sales Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
                            .brand { font-size: 14px; color: #4f46e5; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 11px; }
                            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
                            th { background: #f1f5f9; font-weight: 600; }
                            .text-right { text-align: right; }
                            .summary { margin-top: 12px; font-size: 12px; }
                            .summary span { margin-right: 20px; }
                            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
                            .badge-green { background: #dcfce7; color: #16a34a; }
                            .badge-blue { background: #dbeafe; color: #2563eb; }
                            .badge-purple { background: #f3e8ff; color: #9333ea; }
                            .emerald { color: #059669; }
                            .red { color: #dc2626; }
                            .blue { color: #2563eb; }
                            @page { size: auto; margin: 10mm; }
                            @media print { body { padding: 0; } }
                          </style>
                        </head>
                        <body>
                          <div class="brand">Nosh POS</div>
                          <div class="subtitle">Printed by: ${printedByName}</div>
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
              <div id="print-sales-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">Total Sales Report</h1>
                <p className="text-sm text-slate-500 mb-1">
                  Generated: {new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-sm text-slate-500 mb-4">Printed by: {printedByName}</p>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Slip ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Menu</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Qty</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Subtotal</th>
                        <th className="px-4 py-3 text-right font-semibold text-red-700">Discount</th>
                        <th className="px-4 py-3 text-right font-semibold text-blue-700">Tax</th>
                        <th className="px-4 py-3 text-right font-semibold text-green-700">Grand Total</th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700">Payment</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Remark</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slipData.length === 0 ? (
                        <tr><td colSpan="10" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                      ) : (
                        slipData.map((slip) => {
                          const paymentType = slip.payment_type || "Cash";
                          const menusText = slip.menus.map(m => `${m.menu_name}${m.isSet ? ' (Set)' : ''} x${m.qty}`).join(", ");
                          const totalDiscount = slip.discount_amount + slip.item_discount;
                          return (
                            <tr key={slip.order_id} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                              <td className="px-4 py-3 font-medium text-slate-700">{slip.order_id}</td>
                              <td className="px-4 py-3 text-slate-700">{menusText}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{slip.qty}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{mmkFormatter.format(slip.subtotal)}</td>
                              <td className="px-4 py-3 text-right text-red-600">
                                {totalDiscount > 0 ? mmkFormatter.format(totalDiscount) : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-4 py-3 text-right text-blue-600">{mmkFormatter.format(slip.tax_amount)}</td>
                              <td className="px-4 py-3 text-right text-green-700 font-bold">{mmkFormatter.format(slip.total)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  paymentType === "Cash" ? "bg-green-100 text-green-800" : paymentType === "Kpay" ? "bg-blue-100 text-blue-800" : paymentType === "Coupon" ? "bg-yellow-100 text-yellow-800" : "bg-purple-100 text-purple-800"
                                }`}>
                                  {paymentType === "Cash" ? "Cash" : paymentType === "Kpay" ? "Kpay" : paymentType === "Coupon" ? "Coupon" : "FOC"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{slip.remark || "-"}</td>
                              <td className="px-4 py-3 text-slate-600">{new Date(slip.created_at).toLocaleDateString()}</td>
                            </tr>
                          );
                        })
                      )}
                      {/* Summary row */}
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                        <td colSpan="3" className="px-4 py-3 text-right text-slate-700">TOTAL</td>
                        <td className="px-4 py-3 text-right text-slate-700">{mmkFormatter.format(totalSubtotal)}</td>
                        <td className="px-4 py-3 text-right text-red-600">-{mmkFormatter.format(totalDiscount)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">+{mmkFormatter.format(totalTax)}</td>
                        <td className="px-4 py-3 text-right text-green-700">{mmkFormatter.format(grandTotal)}</td>
                        <td colSpan="3"></td>
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
