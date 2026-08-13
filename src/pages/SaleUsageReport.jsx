import { useEffect, useMemo, useState } from "react";
import supabase from "../createClients";

export default function SaleUsageReport() {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [menus, setMenus] = useState([]);
  const [menuSets, setMenuSets] = useState([]);
  const [menuSetItems, setMenuSetItems] = useState([]);
  const [menuIngredients, setMenuIngredients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSlipId, setSelectedSlipId] = useState(null);
  const rowsPerPage = 15;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && showPreviewModal) setShowPreviewModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPreviewModal]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "null");
  const printedByName = currentUser?.full_name || currentUser?.username || currentUser?.id || "Unknown";

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: ordersData, error: ordersErr },
        { data: itemsData, error: itemsErr },
        { data: menusData, error: menusErr },
        { data: menuSetsData, error: setsErr },
        { data: menuSetItemsData, error: setItemsErr },
        { data: menuIngredientsData, error: ingredientsErr },
        { data: inventoryData, error: inventoryErr },
        { data: usersData, error: usersErr },
      ] = await Promise.all([
        supabase.from("orders").select("*").eq("status", "completed").order("created_at", { ascending: false }).range(0, 9999),
        supabase.from("order_items").select("*").range(0, 9999),
        supabase.from("menu").select("id, menu_name").range(0, 9999),
        supabase.from("menu_sets").select("id, set_name").range(0, 9999),
        supabase.from("menu_set_items").select("set_id, menu_id").range(0, 9999),
        supabase.from("menu_ingredients").select("menu_id, inventory_id, qty").range(0, 9999),
        supabase.from("inventory").select("id, item_name, type, price").range(0, 9999),
        supabase.from("user").select("id, full_name, username").range(0, 9999),
      ]);

      if (ordersErr) throw ordersErr;
      if (itemsErr) throw itemsErr;
      if (menusErr) throw menusErr;
      if (setsErr) throw setsErr;
      if (setItemsErr) throw setItemsErr;
      if (ingredientsErr) throw ingredientsErr;
      if (inventoryErr) throw inventoryErr;
      if (usersErr) throw usersErr;

      setOrders(ordersData || []);
      setOrderItems(itemsData || []);
      setMenus(menusData || []);
      setMenuSets(menuSetsData || []);
      setMenuSetItems(menuSetItemsData || []);
      setMenuIngredients(menuIngredientsData || []);
      setInventory(inventoryData || []);
      setUsers(usersData || []);
    } catch (err) {
      console.error("SaleUsageReport.fetchData error:", err);
      setOrders([]);
      setOrderItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getCreatedAtDate = (createdAt) => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    return isNaN(date.getTime()) ? null : date;
  };

  const menuSetItemsMap = useMemo(() => {
    const map = {};
    (menuSetItems || []).forEach((item) => {
      if (!map[item.set_id]) map[item.set_id] = [];
      map[item.set_id].push(item);
    });
    return map;
  }, [menuSetItems]);

  const menuIngredientsMap = useMemo(() => {
    const map = {};
    (menuIngredients || []).forEach((ingredient) => {
      if (!map[ingredient.menu_id]) map[ingredient.menu_id] = [];
      map[ingredient.menu_id].push(ingredient);
    });
    return map;
  }, [menuIngredients]);

  const getInventoryUsageRows = (item, order) => {
    const saleQty = Number(item.qty) || 0;
    const itemName = item.menu_name || "Unknown";
    const saleMenuName = item.menu_set_id ? `Set: ${itemName}` : itemName;
    const rows = [];
    let rowIndex = 0;

    const addUsageRows = (ingredientList) => {
      ingredientList.forEach((ingredient) => {
        const inventoryRow = inventory.find((inv) => Number(inv.id) === Number(ingredient.inventory_id));
        const usageQty = saleQty * (Number(ingredient.qty) || 0);
        const itemPrice = Number(inventoryRow?.price ?? item.price) || 0;
        rows.push({
          order_id: order.id,
          order_created_at: order.created_at,
          usage_item_name: inventoryRow?.item_name || `Inventory #${ingredient.inventory_id}`,
          usage_qty: usageQty,
          usage_unit: inventoryRow?.type || "-",
          inventory_id: ingredient.inventory_id,
          order_item_id: item.id,
          item_price: itemPrice,
          usage_total_price: usageQty * itemPrice,
          usage_row_id: `${order.id}-${item.id ?? "oi"}-${ingredient.inventory_id ?? "none"}-${rowIndex++}`,
        });
      });
    };

    if (item.menu_set_id) {
      const setItems = menuSetItemsMap[item.menu_set_id] || [];
      setItems.forEach((setItem) => {
        addUsageRows(menuIngredientsMap[setItem.menu_id] || []);
      });
    } else {
      addUsageRows(menuIngredientsMap[item.menu_id] || []);
    }

    return rows;
  };

  const filteredItems = useMemo(() => {
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
      endDate.setHours(23, 59, 59, 999);
    }

    const completedOrderIds = new Set((orders || []).map((order) => order.id));
    const ordersById = (orders || []).reduce((map, order) => {
      map[order.id] = order;
      return map;
    }, {});

    const rows = [];
    (orderItems || [])
      .filter((item) => completedOrderIds.has(item.order_id))
      .forEach((item) => {
        const order = ordersById[item.order_id] || {};
        rows.push(...getInventoryUsageRows(item, order));
      });

    const filtered = rows.filter((item) => {
      const recordDate = getCreatedAtDate(item.order_created_at);
      if (startDate && recordDate && recordDate < startDate) return false;
      if (endDate && recordDate && recordDate > endDate) return false;

      if (search) {
        const value = search.toLowerCase();
        const searchFields = [
          item.usage_item_name,
          item.order_id,
        ];
        return searchFields.some((field) => String(field || "").toLowerCase().includes(value));
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const dateA = getCreatedAtDate(a.order_created_at)?.getTime() || 0;
      const dateB = getCreatedAtDate(b.order_created_at)?.getTime() || 0;
      if (dateA !== dateB) return dateB - dateA;
      if (a.order_id !== b.order_id) return b.order_id - a.order_id;
      return a.usage_item_name.localeCompare(b.usage_item_name || "");
    });
  }, [orders, orderItems, menus, menuSets, users, dateFilter, customStart, customEnd, search, inventory, menuSetItemsMap, menuIngredientsMap]);

  const aggregatedSlipRows = useMemo(() => {
    const slipMap = {};
    const slipOrderItemSeen = {};

    filteredItems.forEach((item) => {
      if (!slipMap[item.order_id]) {
        slipMap[item.order_id] = {
          order_id: item.order_id,
          order_created_at: item.order_created_at,
          usage_items: new Set(),
          usage_item_details: [],
          total_items: 0,
          total_price: 0,
        };
      }

      slipMap[item.order_id].usage_items.add(item.usage_item_name);
      slipMap[item.order_id].usage_item_details.push(`${item.usage_item_name} ${item.usage_qty}${item.usage_unit}`);
      slipMap[item.order_id].total_items += 1;
      slipMap[item.order_id].total_price += Number(item.usage_total_price || 0);
    });

    return Object.values(slipMap)
      .map((slip) => {
        const itemNames = Array.from(slip.usage_items);
        const preview = itemNames.length <= 3 ? itemNames.join(", ") : `${itemNames.slice(0, 3).join(", ")}, ...`;
        // build menu summary from orderItems (sum qty per menu_name for this slip)
        const menuMap = {};
        (orderItems || []).filter(it => Number(it.order_id) === Number(slip.order_id)).forEach(mi => {
          let mname = '';
          if (mi.menu_set_id) {
            const set = (menuSets || []).find(s => String(s.id) === String(mi.menu_set_id));
            mname = mi.menu_name && mi.menu_name !== 'Unknown' ? mi.menu_name : (set?.set_name ? `Set: ${set.set_name}` : (mi.menu_name || 'Unknown'));
          } else {
            const menuRow = (menus || []).find(m => String(m.id) === String(mi.menu_id));
            mname = mi.menu_name && mi.menu_name !== 'Unknown' ? mi.menu_name : (menuRow?.menu_name || mi.menu_name || 'Unknown');
          }
          menuMap[mname] = (menuMap[mname] || 0) + (Number(mi.qty) || 0);
        });
        const menuNames = Object.entries(menuMap).map(([n,q]) => `${n} x${q}`);
        const menuPreview = menuNames.length <= 3 ? menuNames.join(', ') : `${menuNames.slice(0,3).join(', ')}, ...`;
        const menuDetails = menuNames.join('; ') || '-';

        return {
          order_id: slip.order_id,
          order_created_at: slip.order_created_at,
          usage_item_preview: preview || "-",
          usage_item_details: slip.usage_item_details.join("; ") || "-",
          usage_total_items: slip.total_items,
          usage_total_price: slip.total_price,
          usage_row_id: `slip-${slip.order_id}`,
          menu_preview: menuPreview || '-',
          menu_details: menuDetails,
        };
      })
      .sort((a, b) => {
        const dateA = getCreatedAtDate(a.order_created_at)?.getTime() || 0;
        const dateB = getCreatedAtDate(b.order_created_at)?.getTime() || 0;
        if (dateA !== dateB) return dateB - dateA;
        return b.order_id - a.order_id;
      });
  }, [filteredItems]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return aggregatedSlipRows.slice(start, start + rowsPerPage);
  }, [aggregatedSlipRows, currentPage]);

  const usageBySlip = useMemo(() => {
    const map = {};
    filteredItems.forEach((item) => {
      if (!map[item.order_id]) map[item.order_id] = [];
      map[item.order_id].push(item);
    });
    return map;
  }, [filteredItems]);

  const totalPages = Math.max(1, Math.ceil(aggregatedSlipRows.length / rowsPerPage));

  const grandTotal = useMemo(
    () => aggregatedSlipRows.reduce((sum, row) => sum + Number(row.usage_total_price || 0), 0),
    [aggregatedSlipRows]
  );

  const exportToExcel = () => {
    const reportData = aggregatedSlipRows.map((item) => ({
      "Slip ID": item.order_id,
      "Menus": item.menu_preview,
      "Usage Items": item.usage_item_preview,
      "Usage Details": item.usage_item_details,
      "Total Price": mmkFormatter.format(item.usage_total_price),
    }));
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><tr style="background:#ddd;font-weight:bold;"><td>Slip ID</td><td>Menus</td><td>Usage Items</td><td>Usage Details</td><td>Total Price</td></tr>${reportData.map((row) => `<tr><td>${row["Slip ID"]}</td><td>${row["Menus"]}</td><td>${row["Usage Items"]}</td><td>${row["Usage Details"]}</td><td>${row["Total Price"]}</td></tr>`).join("")}<tr style="font-weight:bold;"><td colspan="4">Grand Total</td><td>${mmkFormatter.format(grandTotal)}</td></tr></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sale_usage_report_${new Date().toISOString().split("T")[0]}.xls`;
    link.click();
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Sale Usage Report</h1>
          <p className="text-sm text-slate-500 mt-1">View completed orders and order item usage that reduce inventory.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
              placeholder="Search orders or items..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
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
        </div>
      </div>

      <div className="flex justify-end gap-4 mb-4 text-sm font-semibold text-slate-700">
        <span>Grand Total:</span>
        <span>{mmkFormatter.format(grandTotal)}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Slip ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Menus</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Usage Items</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Count</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Total Price</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : paginatedItems.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No sale usage records found.</td></tr>
            ) : (
              paginatedItems.map((item) => (
                <tr key={item.usage_row_id} className="border-b border-slate-100 hover:bg-slate-100 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">#{item.order_id}</td>
                  <td className="px-4 py-3 text-slate-600">{item.menu_preview}</td>
                  <td className="px-4 py-3 text-slate-600">{item.usage_item_preview}</td>
                  <td className="px-4 py-3 text-slate-600">{item.usage_total_items}</td>
                  <td className="px-4 py-3 text-slate-600">{mmkFormatter.format(item.usage_total_price)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <button
                      onClick={() => { setSelectedSlipId(item.order_id); setShowDetailModal(true); }}
                      className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2 mt-4">
        <p className="text-sm text-slate-500">Showing {paginatedItems.length} of {filteredItems.length} records</p>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            className="px-3 py-2 border rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {showPreviewModal && (
        <div onClick={() => setShowPreviewModal(false)} className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-semibold">Sale Usage Report</h3>
                <p className="text-sm text-slate-500">Printed by {printedByName} on {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-saleusage-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Sale Usage Report</title>
                          <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            h1 { font-size: 18px; margin-bottom: 4px; }
                            .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
                            .brand { font-size: 14px; color: #4f46e5; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; font-size: 11px; }
                            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
                            th { background: #f1f5f9; font-weight: 600; }
                            .summary { margin-top: 12px; font-size: 12px; }
                            .summary span { margin-right: 20px; }
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
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm"
                >
                  Print
                </button>
                <button onClick={() => setShowPreviewModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-x-auto overflow-y-auto">
              <div id="print-saleusage-content" className="min-w-full">
                {/* Summary table: aggregated slips with Menus */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold mb-2">Summary</h4>
                  <table className="w-full text-sm mb-2">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-2 text-left">Slip ID</th>
                        <th className="px-4 py-2 text-left">Menus</th>
                        <th className="px-4 py-2 text-left">Usage Items</th>
                        <th className="px-4 py-2 text-left">Item Count</th>
                        <th className="px-4 py-2 text-left">Total Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aggregatedSlipRows.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-4 text-center text-slate-500">No summary data</td></tr>
                      ) : (
                        aggregatedSlipRows.map((r) => (
                          <tr key={`sum-${r.order_id}`} className="border-b">
                            <td className="px-4 py-2">#{r.order_id}</td>
                            <td className="px-4 py-2">{r.menu_preview}</td>
                            <td className="px-4 py-2">{r.usage_item_preview}</td>
                            <td className="px-4 py-2">{r.usage_total_items}</td>
                            <td className="px-4 py-2">{mmkFormatter.format(r.usage_total_price)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left">Slip ID</th>
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-left">Usage Qty</th>
                      <th className="px-4 py-3 text-left">Unit</th>
                      <th className="px-4 py-3 text-left">Unit Price</th>
                      <th className="px-4 py-3 text-left">Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No sale usage data available.</td></tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr key={item.usage_row_id} className="border-b border-slate-100">
                          <td className="px-4 py-3">#{item.order_id}</td>
                          <td className="px-4 py-3">{item.usage_item_name}</td>
                          <td className="px-4 py-3">{item.usage_qty}</td>
                          <td className="px-4 py-3">{item.usage_unit}</td>
                          <td className="px-4 py-3">{mmkFormatter.format(item.item_price)}</td>
                          <td className="px-4 py-3">{mmkFormatter.format(item.usage_total_price)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                {filteredItems.length > 0 && (
                  <div className="flex justify-end mt-4 text-sm font-semibold text-slate-700">
                    <span>Grand Total:</span>
                    <span className="ml-2">{mmkFormatter.format(filteredItems.reduce((sum, item) => sum + Number(item.usage_total_price || 0), 0))}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-4">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-semibold">Slip #{selectedSlipId} Details</h3>
                <p className="text-sm text-slate-500">Usage stock details for the selected completed order slip.</p>
              </div>
              <button
                onClick={() => { setShowDetailModal(false); setSelectedSlipId(null); }}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Usage Item</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Usage Qty</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Total Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(usageBySlip[selectedSlipId] || []).length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No usage details available for this slip.</td></tr>
                  ) : (
                    (usageBySlip[selectedSlipId] || []).map((item) => (
                      <tr key={item.usage_row_id} className="border-b border-slate-100">
                        <td className="px-4 py-3">{item.usage_item_name}</td>
                        <td className="px-4 py-3">{item.usage_qty}</td>
                        <td className="px-4 py-3">{item.usage_unit}</td>
                        <td className="px-4 py-3">{mmkFormatter.format(item.item_price)}</td>
                        <td className="px-4 py-3">{mmkFormatter.format(item.usage_total_price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {(usageBySlip[selectedSlipId] || []).length > 0 && (
                <div className="flex justify-end mt-4 text-sm font-semibold text-slate-700">
                  <span>Slip Total:</span>
                  <span className="ml-2">{mmkFormatter.format((usageBySlip[selectedSlipId] || []).reduce((sum, item) => sum + Number(item.usage_total_price || 0), 0))}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 border-t border-slate-200">
              <button
                onClick={() => { setShowDetailModal(false); setSelectedSlipId(null); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
