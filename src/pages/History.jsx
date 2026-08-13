import { useEffect, useState } from "react";
import supabase from "../createClients";
import Swal from "sweetalert2";
import { buildFifoList, deductFromFifo, restoreToFifo } from "../utils/fifoService";
import { hasFeature } from "../utils/accessControl";

export default function History({ setInventory }) {
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [fifoHistory, setFifoHistory] = useState({});
  const [cancelReasons, setCancelReasons] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ordersPerPage = 8;
  const initialBatchSize = 100;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });
  const localUser = JSON.parse(localStorage.getItem("user") || "null");
  const canComplete = hasFeature(localUser, "history-complete");
  const canCancel = hasFeature(localUser, "history-cancel");
  const canEditHistory = hasFeature(localUser, "btn-history-edit");

  const [editOrder, setEditOrder] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    payment_type: "",
    status: "",
  });

  // Get date range based on filter type
  const getDateRange = () => {
    const now = new Date();
    let start = null;
    let end = new Date(now);

    switch (dateFilter) {
      case "day":
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "custom":
        if (startDate && endDate) {
          start = new Date(startDate);
          end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
        }
        break;
      default:
        return null;
    }
    return start ? { start, end } : null;
  };

  // Filter history by date
  const filteredByDate = (orders) => {
    const range = getDateRange();
    if (!range) return orders;

    return orders.filter((order) => {
      const orderDate = new Date(order.created_at);
      return orderDate >= range.start && orderDate <= range.end;
    });
  };

  const normalizeOrderId = (value) => String(value ?? "").trim();

  const handleOpenEdit = (order) => {
    setEditOrder(order);
    setEditForm({
      payment_type: order.payment_type || "",
      status: order.status || "pending",
    });
    setShowEditModal(true);
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const buildOrderInventoryRequirements = (order) => {
    const neededByInventoryId = {};
    for (const item of order.items) {
      if (item.isSet) {
        for (const setItem of item.setItems || []) {
          const ingredients = ingredientsMap[setItem.menu_id] || [];
          for (const ing of ingredients) {
            const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
            neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
          }
        }
      } else {
        const ingredients = ingredientsMap[item.menu_id] || [];
        for (const ing of ingredients) {
          const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
          neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
        }
      }
    }
    return neededByInventoryId;
  };

  const deductOrderInventory = async (order) => {
    const { data: inventoryData, error: inventoryErr } = await supabase
      .from("inventory")
      .select("*");
    if (inventoryErr) throw inventoryErr;

    const inventoryList = (inventoryData || []).map((i) => ({ ...i }));
    const neededByInventoryId = buildOrderInventoryRequirements(order);
    const warnings = [];

    for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
      const inv = inventoryList.find((i) => i.id === Number(inventoryId));
      const currentQty = parseFloat(inv?.qty) || 0;
      const newQty = currentQty - neededQty;

      const { error: invUpdateErr } = await supabase
        .from("inventory")
        .update({ qty: newQty })
        .eq("id", Number(inventoryId));
      if (invUpdateErr) throw invUpdateErr;

      if (inv) inv.qty = newQty;

      const fifoList = await buildFifoList(
        Number(inventoryId),
        inv?.item_name,
        inv?.type || inv?.unit,
        { includePurchase: true, includeAddStock: true, onlyWithRemainingQty: true }
      );

      const deductResult = await deductFromFifo(fifoList, neededQty);
      if (!deductResult.success) {
        warnings.push(`${inv?.item_name || inventoryId} (remaining ${deductResult.remaining})`);
      }
    }

    if (setInventory) setInventory(inventoryList);
    return warnings;
  };

  const restoreOrderInventory = async (order) => {
    const { data: inventoryData, error: inventoryErr } = await supabase
      .from("inventory")
      .select("*");
    if (inventoryErr) throw inventoryErr;

    const inventoryList = (inventoryData || []).map((i) => ({ ...i }));
    const neededByInventoryId = buildOrderInventoryRequirements(order);
    const warnings = [];

    for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
      const inv = inventoryList.find((i) => i.id === Number(inventoryId));
      const currentQty = parseFloat(inv?.qty) || 0;
      const newQty = currentQty + neededQty;

      const { error: invUpdateErr } = await supabase
        .from("inventory")
        .update({ qty: newQty })
        .eq("id", Number(inventoryId));
      if (invUpdateErr) throw invUpdateErr;

      if (inv) inv.qty = newQty;

      const fifoList = await buildFifoList(
        Number(inventoryId),
        inv?.item_name,
        inv?.type || inv?.unit,
        { includePurchase: true, includeAddStock: true, onlyWithRemainingQty: false }
      );

      const restoreResult = await restoreToFifo(fifoList, neededQty);
      if (!restoreResult.success) {
        warnings.push(`${inv?.item_name || inventoryId} (remaining ${restoreResult.remaining})`);
      }
    }

    if (setInventory) setInventory(inventoryList);
    return warnings;
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editOrder) return;

    const previousStatus = editOrder.status || "pending";
    const newStatus = editForm.status || "pending";
    const paymentType = editForm.payment_type || null;

    const statusPayload = {
      status: newStatus,
      payment_type: paymentType,
    };

    if (previousStatus !== newStatus) {
      if (newStatus === "completed") {
        statusPayload.completed_by = localUser?.id || null;
        statusPayload.completed_at = new Date().toISOString();
        statusPayload.cancelled_by = null;
        statusPayload.cancelled_at = null;
        statusPayload.cancel_note = null;
      } else if (newStatus === "cancelled") {
        statusPayload.cancelled_by = localUser?.id || null;
        statusPayload.cancelled_at = new Date().toISOString();
        statusPayload.cancel_note = editOrder.cancel_note || null;
        statusPayload.completed_by = null;
        statusPayload.completed_at = null;
      } else {
        statusPayload.completed_by = null;
        statusPayload.completed_at = null;
        statusPayload.cancelled_by = null;
        statusPayload.cancelled_at = null;
        statusPayload.cancel_note = null;
      }
    }

    try {
      const updateOrderStatus = async () => {
        const { error } = await supabase
          .from("orders")
          .update(statusPayload)
          .eq("id", editOrder.id);
        if (error) throw error;
      };

      if (previousStatus === "completed" && newStatus !== "completed") {
        await restoreOrderInventory(editOrder);
      }

      if (previousStatus !== "completed" && newStatus === "completed") {
        await deductOrderInventory(editOrder);
      }

      await updateOrderStatus();

      setHistory((prev) =>
        prev.map((order) =>
          order.id === editOrder.id ? { ...order, ...statusPayload } : order
        )
      );
      setShowEditModal(false);
      setEditOrder(null);
      Swal.fire("Success", "Order history updated", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to update order", "error");
    }
  };

  // Fetch history in batches so large datasets do not overwhelm the page
  const fetchHistory = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      }

      const batchSize = loadMore ? 100 : initialBatchSize;
      const offset = loadMore ? history.length : 0;
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, created_at, subtotal, discount_percent, discount_amount, tax_percent, tax_amount, total, status, payment_type, remark, discount_type, role, cancelled_by, completed_by, completed_at, cancelled_at, cancel_note")
        .order("created_at", { ascending: false })
        .range(offset, offset + batchSize - 1);

      if (ordersErr) throw ordersErr;
      if (!orders || orders.length === 0) {
        setHasMore(false);
        if (loadMore) {
          setLoadingMore(false);
        }
        return;
      }

      const nextOrders = loadMore ? [...history, ...orders] : orders;
      const allOrders = nextOrders;

      if (allOrders.length === 0) {
        setHistory([]);
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      const orderIds = allOrders.map((order) => order.id);
      const chunkSize = 100;
      let allOrderItems = [];

      for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        const { data: orderItemsChunk, error: itemsErr } = await supabase
          .from("order_items")
          .select("id, order_id, menu_id, menu_set_id, qty, price, original_price")
          .in("order_id", chunk)
          .order("id", { ascending: true });

        if (itemsErr) throw itemsErr;
        allOrderItems = [...allOrderItems, ...(orderItemsChunk || [])];
      }

      const missingOrderIds = allOrders
        .filter((order) => !allOrderItems.some((item) => normalizeOrderId(item.order_id) === normalizeOrderId(order.id)))
        .map((order) => order.id);

      if (missingOrderIds.length > 0) {
        for (const orderId of missingOrderIds) {
          const { data: fallbackItems, error: fallbackErr } = await supabase
            .from("order_items")
            .select("id, order_id, menu_id, menu_set_id, qty, price, original_price")
            .eq("order_id", orderId)
            .order("id", { ascending: true });

          if (fallbackErr) throw fallbackErr;
          allOrderItems = [...allOrderItems, ...(fallbackItems || [])];
        }
      }

      const { data: menuData, error: menuErr } = await supabase
        .from("menu")
        .select("id, menu_name");
      if (menuErr) throw menuErr;

      const { data: menuSetsData, error: setsErr } = await supabase
        .from("menu_sets")
        .select("id, set_name");
      if (setsErr) throw setsErr;

      const { data: usersData } = await supabase.from("user").select("id, full_name");
      const userMap = {};
      (usersData || []).forEach((u) => { userMap[u.id] = u; });

      const { data: menuSetItemsData, error: setItemsErr } = await supabase
        .from("menu_set_items")
        .select("set_id, menu_id");
      if (setItemsErr) throw setItemsErr;

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("menu_id, inventory_id, qty");
      if (ingErr) throw ingErr;

      const ingMap = {};
      ingData.forEach((ing) => {
        if (!ingMap[ing.menu_id]) ingMap[ing.menu_id] = [];
        ingMap[ing.menu_id].push(ing);
      });
      setIngredientsMap(ingMap);

      const setItemsMap = {};
      menuSetItemsData.forEach((item) => {
        if (!setItemsMap[item.set_id]) setItemsMap[item.set_id] = [];
        setItemsMap[item.set_id].push(item);
      });

      const historyData = allOrders.map((order) => {
        const matchedItems = allOrderItems.filter((i) => normalizeOrderId(i.order_id) === normalizeOrderId(order.id));
        const items = matchedItems.map((i) => {
            if (i.menu_set_id) {
              const menuSet = menuSetsData.find((s) => s.id === i.menu_set_id);
              return {
                ...i,
                menu_name: menuSet?.set_name || "Unknown Set",
                isSet: true,
                setItems: setItemsMap[i.menu_set_id] || [],
              };
            }
            return {
              ...i,
              menu_name: menuData.find((m) => m.id === i.menu_id)?.menu_name || "Unknown Menu",
              isSet: false,
            };
          });

        return {
          ...order,
          items,
          cancelled_by_name: userMap[order.cancelled_by]?.full_name || null,
          completed_by_name: userMap[order.completed_by]?.full_name || null,
        };
      });

      setHistory(historyData);
      setHasMore(orders.length === batchSize);
      setLoadingMore(false);
    } catch (err) {
      console.error(err);
      setLoadingMore(false);
      Swal.fire("Error", err.message || "Failed to fetch history", "error");
    }
  };

  const fetchCancelReasons = async () => {
    try {
      const { data, error } = await supabase
        .from("cancel_reason_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCancelReasons(data || []);
    } catch (err) {
      console.error("Failed to load cancel reasons:", err);
      setCancelReasons([]);
    }
  };

  useEffect(() => {
    fetchHistory(false);
    fetchCancelReasons();
  }, []);

  // Filtered history based on search, date, and status
  const filteredHistory = filteredByDate(history).filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }
    const searchLower = search.toLowerCase();
    const matchOrderId = order.id.toString().includes(searchLower);
    const matchMenuItem = order.items.some((item) =>
      item.menu_name.toLowerCase().includes(searchLower)
    );
    return matchOrderId || matchMenuItem;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredHistory.length / ordersPerPage);
  const paginatedHistory = filteredHistory.slice(
    (page - 1) * ordersPerPage,
    page * ordersPerPage
  );

  // Print receipt
  const printReceipt = (order) => {
    const date = new Date(order.created_at).toLocaleString();
    const statusLabel = order.status === 'pending' ? 'PENDING' : order.status === 'completed' ? 'COMPLETED' : 'CANCELLED';
    const subtotal = order.subtotal || 0;
    const discountPercent = order.discount_percent || 0;
    const discountAmount = order.discount_amount || 0;
    const taxPercent = order.tax_percent || 0;
    const taxAmount = order.tax_amount || 0;
    const manualDiscount = (order.items || []).reduce((sum, item) => {
      if (item.original_price != null && item.original_price > item.price) {
        return sum + (item.original_price - item.price) * item.qty;
      }
      return sum;
    }, 0);
    const printedByName = localUser?.full_name || localUser?.username || localUser?.id || 'Unknown';
    const receiptContent = `
      <html>
        <head><title>Order #${order.id}</title></head>
        <body style="font-family: monospace; width: 300px; padding: 10px;">
          <h1 style="text-align:center;">F&B ATY PRINT SLIP</h1>
          <p>Print Slip ID: ${order.id}</p>
          <p>Date: ${date}</p>
          <table style="width:100%; border-collapse: collapse;">
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
              ${order.items.map(i => `<tr>
                <td>${i.menu_name}${i.isSet ? ' (Set)' : ''}</td>
                <td>${i.qty}</td>
                <td>${mmkFormatter.format(i.price)}</td>
                <td>${mmkFormatter.format(i.price * i.qty)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
          <hr/>
          <div style="text-align:right;">
            <p>Subtotal: ${mmkFormatter.format(subtotal)}</p>
            ${manualDiscount > 0 ? `<p style="color:black;">Sub Discount: -${mmkFormatter.format(manualDiscount)}</p>` : ''}
            ${discountAmount > 0 ? `<p style="color:black;">Discount (${discountPercent}%): -${mmkFormatter.format(discountAmount)}</p>` : ''}
            ${taxAmount > 0 ? `<p style="color:black;">Tax (${taxPercent}%): +${mmkFormatter.format(taxAmount)}</p>` : ''}
            <p style="font-weight:bold; font-size:1.2em;">Total: ${mmkFormatter.format(order.total)}</p>
          </div>
          <p style="margin-top:12px;">Printed by: ${printedByName}</p>
          <p style="text-align:center;">Thank you!</p>
        </body>
      </html>
    `;
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(receiptContent);
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    document.body.removeChild(iframe);
  };

  // Complete order - deduct inventory + purchase history (FIFO), then set status
  const handleComplete = async (order) => {
    if (!canComplete) {
      return Swal.fire("Not allowed", "You do not have permission to complete orders", "error");
    }
    try {
      const { data: inventoryData, error: inventoryErr } = await supabase
        .from("inventory")
        .select("*");
      if (inventoryErr) throw inventoryErr;

      const updatedInventory = (inventoryData || []).map((i) => ({ ...i }));

      // Build required ingredient qty per inventory item for this order
      const neededByInventoryId = {};
      for (const item of order.items) {
        if (item.isSet) {
          for (const setItem of item.setItems || []) {
            const ingredients = ingredientsMap[setItem.menu_id] || [];
            for (const ing of ingredients) {
              const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
              neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
            }
          }
        } else {
          const ingredients = ingredientsMap[item.menu_id] || [];
          for (const ing of ingredients) {
            const need = (parseFloat(ing.qty) || 0) * (parseFloat(item.qty) || 0);
            neededByInventoryId[ing.inventory_id] = (neededByInventoryId[ing.inventory_id] || 0) + need;
          }
        }
      }

      // Allow negative inventory - no validation
      // for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
      //   const inv = updatedInventory.find((i) => i.id === Number(inventoryId));
      //   if (!inv || (parseFloat(inv.qty) || 0) < neededQty) {
      //     throw new Error(`Not enough stock for ${inv?.item_name || `Inventory ID ${inventoryId}`}`);
      //   }
      // }

      // FIFO deduction from stock history (Purchase + Add Stock) by created_at
      const deductFromStockHistory = async (inventoryId, _itemName, _itemType, qtyToDeduct) => {
        const getFifoTimestamp = (value) => {
          if (!value) return Number.POSITIVE_INFINITY;
          let ts = new Date(value).getTime();
          if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
          return ts;
        };

        // Fetch all received purchases with created_at for accurate FIFO
        const { data: purchases, error: purchasesErr } = await supabase
          .from("purchases")
          .select("id, date, created_at")
          .eq("status", "received");

        if (purchasesErr) throw purchasesErr;
        const purchaseIds = (purchases || []).map((p) => p.id);

        // Fetch all add_stock records
        const { data: addStockRecords, error: addStockErr } = await supabase
          .from("internal_consumption")
          .select("id, created_at")
          .eq("status", "add_stock");

        if (addStockErr) throw addStockErr;
        const addStockIds = (addStockRecords || []).map((r) => r.id);

        // Build combined FIFO list
        const fifoList = [];

        // Fetch inventory for matching
        const { data: allInventory, error: invErr } = await supabase
          .from("inventory")
          .select("id, item_name, type");

        if (invErr) throw invErr;
        const targetInv = allInventory.find(inv => inv.id === inventoryId);

        if (targetInv) {
          const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
          const normalizeType = (value) => {
            const normalized = value?.toString().trim().toLowerCase();
            return normalized || "-";
          };
          const targetName = normalizeName(targetInv.item_name);
          const targetType = normalizeType(targetInv.type);

          // Add purchase items
          if (purchaseIds.length > 0) {
            const { data: purchaseItems, error: itemsErr } = await supabase
              .from("purchase_items")
              .select("id, qty, unit_price, purchase_id, item_name, type")
              .in("purchase_id", purchaseIds);

            if (itemsErr) throw itemsErr;
            if (purchaseItems) {
              const exactMatches = purchaseItems.filter((pi) =>
                normalizeName(pi.item_name) === targetName &&
                normalizeType(pi.type) === targetType
              );
              const matchedPurchaseItems = exactMatches.length > 0
                ? exactMatches
                : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

              matchedPurchaseItems.forEach(pi => {
                const purchase = purchases?.find(p => p.id === pi.purchase_id);
                // Use created_at for FIFO (more accurate than date only)
                const fifoDate = purchase?.created_at || purchase?.date;
                fifoList.push({
                  id: pi.id,
                  qty: parseFloat(pi.qty) || 0,
                  unit_price: parseFloat(pi.unit_price) || 0,
                  date: fifoDate,
                  fifoTimestamp: getFifoTimestamp(fifoDate),
                  source: "purchase"
                });
              });
            }
          }

          // Add add_stock items
          if (addStockIds.length > 0) {
            const { data: addStockItems, error: itemsErr } = await supabase
              .from("internal_consumption_items")
              .select("id, qty, unit_price, consumption_id, inventory_id")
              .in("consumption_id", addStockIds);

            if (itemsErr) throw itemsErr;
            if (addStockItems) {
              addStockItems.forEach(ai => {
                if (ai.inventory_id === inventoryId) {
                  const addStock = addStockRecords?.find(r => r.id === ai.consumption_id);
                  fifoList.push({
                    id: ai.id,
                    qty: parseFloat(ai.qty) || 0,
                    unit_price: parseFloat(ai.unit_price) || 0,
                    date: addStock?.created_at || null,
                    fifoTimestamp: getFifoTimestamp(addStock?.created_at),
                    source: "add_stock"
                  });
                }
              });
            }
          }
        }

        // True FIFO across sources by created_at:
        // 1) oldest created_at first
        // 2) stable numeric id as final tie-breaker
        fifoList.sort((a, b) => {
          if (a.fifoTimestamp !== b.fifoTimestamp) return a.fifoTimestamp - b.fifoTimestamp;
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        });

        // Deduct using FIFO (keeping inline for critical order completion logic)
        let remaining = qtyToDeduct;
        for (const row of fifoList) {
          if (remaining <= 0) break;

          const currentQty = row.qty;
          const unitPrice = row.unit_price;
          if (currentQty <= 0) continue;

          const consumeQty = Math.min(currentQty, remaining);
          const newQty = currentQty - consumeQty;

          // Update the appropriate table
          if (row.source === "purchase") {
            const { error: updateErr } = await supabase
              .from("purchase_items")
              .update({
                qty: newQty,
                total_price: newQty * unitPrice,
              })
              .eq("id", row.id);

            if (updateErr) throw updateErr;
          } else if (row.source === "add_stock") {
            const { error: updateErr } = await supabase
              .from("internal_consumption_items")
              .update({
                qty: newQty,
              })
              .eq("id", row.id);

            if (updateErr) throw updateErr;
          }

          remaining -= consumeQty;
        }

        return remaining;
      };

      const purchaseHistoryWarnings = [];

      // Deduct inventory + purchase history
      for (const [inventoryId, neededQty] of Object.entries(neededByInventoryId)) {
        const inv = updatedInventory.find((i) => i.id === Number(inventoryId));
        const currentQty = parseFloat(inv?.qty) || 0;
        const newQty = currentQty - neededQty;

        const { error: invUpdateErr } = await supabase
          .from("inventory")
          .update({ qty: newQty })
          .eq("id", Number(inventoryId));
        if (invUpdateErr) throw invUpdateErr;

        if (inv) inv.qty = newQty;

        const remaining = await deductFromStockHistory(
          Number(inventoryId),
          inv?.item_name,
          inv?.type || inv?.unit,
          neededQty,
        );
        if (remaining > 0) {
          purchaseHistoryWarnings.push(`${inv?.item_name || inventoryId} (remaining ${remaining})`);
        }
      }

      const { error: statusErr } = await supabase
        .from("orders")
        .update({ status: "completed", completed_by: localUser?.id || null, completed_at: new Date().toISOString() })
        .eq("id", order.id);
      if (statusErr) throw statusErr;

      if (setInventory) setInventory(updatedInventory);

      if (purchaseHistoryWarnings.length > 0) {
        Swal.fire(
          "Completed with warning",
          `Order completed. Purchase history was not enough for: ${purchaseHistoryWarnings.join(", ")}`,
          "warning",
        );
      } else {
        Swal.fire("Success", "Order marked as completed and inventory deducted!", "success");
      }
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to complete order", "error");
    }
  };

  // Fetch FIFO history for inventory item
  const fetchFifoHistory = async (inventoryId) => {
    try {
      const { data: purchases } = await supabase
        .from("purchases")
        .select("id, date, created_at")
        .eq("status", "received");

      const purchaseIds = purchases?.map(p => p.id) || [];

      const { data: addStockRecords } = await supabase
        .from("internal_consumption")
        .select("id, created_at")
        .eq("status", "add_stock");

      const addStockIds = addStockRecords?.map(r => r.id) || [];

      const { data: allInventory } = await supabase
        .from("inventory")
        .select("id, item_name, type");

      const targetInv = allInventory?.find(inv => inv.id === inventoryId);
      const fifoList = [];

      if (targetInv) {
        const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
        const normalizeType = (value) => value?.toString().trim().toLowerCase() || "-";
        const targetName = normalizeName(targetInv.item_name);
        const targetType = normalizeType(targetInv.type);

        if (purchaseIds.length > 0) {
          const { data: purchaseItems } = await supabase
            .from("purchase_items")
            .select("id, qty, unit_price, purchase_id, item_name, type")
            .in("purchase_id", purchaseIds);

          if (purchaseItems) {
            const exactMatches = purchaseItems.filter((pi) =>
              normalizeName(pi.item_name) === targetName && normalizeType(pi.type) === targetType
            );
            const matchedPurchaseItems = exactMatches.length > 0 ? exactMatches : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

            matchedPurchaseItems.forEach(pi => {
              const purchase = purchases?.find(p => p.id === pi.purchase_id);
              const fifoDate = purchase?.created_at || purchase?.date;
              fifoList.push({
                id: pi.id,
                qty: parseFloat(pi.qty) || 0,
                date: fifoDate,
                source: "purchase",
                item_name: pi.item_name
              });
            });
          }
        }

        if (addStockIds.length > 0) {
          const { data: addStockItems } = await supabase
            .from("internal_consumption_items")
            .select("id, qty, unit_price, consumption_id, inventory_id")
            .in("consumption_id", addStockIds);

          if (addStockItems) {
            addStockItems.forEach(ai => {
              if (ai.inventory_id === inventoryId) {
                const addStock = addStockRecords?.find(r => r.id === ai.consumption_id);
                fifoList.push({
                  id: ai.id,
                  qty: parseFloat(ai.qty) || 0,
                  date: addStock?.created_at || null,
                  source: "add_stock",
                  item_name: targetInv.item_name
                });
              }
            });
          }
        }
      }

      // Sort by FIFO (oldest first)
      fifoList.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : Infinity;
        const bTime = b.date ? new Date(b.date).getTime() : Infinity;
        if (aTime !== bTime) return aTime - bTime;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      return fifoList;
    } catch (err) {
      console.error("Error fetching FIFO history:", err);
      return [];
    }
  };

  const toggleOrderDetails = async (order) => {
    if (expandedOrder === order.id) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(order.id);
      // Fetch FIFO history for all ingredients in this order
      const historyMap = {};
      const neededByInventoryId = {};

      for (const item of order.items) {
        if (item.isSet) {
          for (const setItem of item.setItems || []) {
            const ingredients = ingredientsMap[setItem.menu_id] || [];
            for (const ing of ingredients) {
              neededByInventoryId[ing.inventory_id] = true;
            }
          }
        } else {
          const ingredients = ingredientsMap[item.menu_id] || [];
          for (const ing of ingredients) {
            neededByInventoryId[ing.inventory_id] = true;
          }
        }
      }

      for (const invId of Object.keys(neededByInventoryId)) {
        historyMap[invId] = await fetchFifoHistory(Number(invId));
      }
      setFifoHistory(historyMap);
    }
  };

  // Cancel pending order only (no stock return because deduction happens on complete)
  const handleCancel = async (order) => {
    if (!canCancel) {
      return Swal.fire("Not allowed", "You do not have permission to cancel orders", "error");
    }

    const inputOptions = cancelReasons.reduce((options, reason) => {
      options[reason.id] = reason.name;
      return options;
    }, { "": "No reason selected" });

    const result = await Swal.fire({
      title: "Cancel Order",
      input: "select",
      inputLabel: "Select cancel reason (optional)",
      inputOptions,
      inputPlaceholder: "Select a reason",
      showCancelButton: true,
      confirmButtonText: "Cancel Order",
      cancelButtonText: "Back",
      preConfirm: (value) => value,
    });

    if (!result.isConfirmed) return;

    const note = result.value ? inputOptions[result.value] : "";

    try {
      // Try to set a cancel_note, cancelled_by and cancelled_at columns if they exist; also update status.
      const payload = {
        status: "cancelled",
        cancel_note: note,
        cancelled_by: localUser?.id || null,
        cancelled_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", order.id);

      if (updateErr) {
        // Fallback: append cancel note to remark if cancel_note column not available
        const remark = note ? `${order.remark || ""}${order.remark ? " | " : ""}Cancel Note: ${note}` : order.remark || null;
        const fallbackPayload = {
          status: "cancelled",
          remark,
        };
        const { error: fallbackErr } = await supabase
          .from("orders")
          .update(fallbackPayload)
          .eq("id", order.id);
        if (fallbackErr) throw fallbackErr;
      }

      Swal.fire("Cancelled", "Order cancelled successfully!", "success");
      fetchHistory();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to cancel order", "error");
    }
  };

  // Get status badge color
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' };
      case 'completed':
        return { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' };
      case 'cancelled':
        return { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Order History</h1>
        <p className="text-sm text-slate-500 mt-1">View all order records</p>
      </div>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Status Filter */}
          {['all', 'pending', 'completed', 'cancelled'].map((status) => {
            const label = status === 'all' ? 'All' : status === 'pending' ? 'Pending' : status === 'completed' ? 'Completed' : 'Cancelled';
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            );
          })}

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
          <option value="all">All Time</option>
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="custom">Custom Date</option>
        </select>

        {/* Custom Date Range */}
        {dateFilter === "custom" && (
          <>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="self-center text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search by Order ID or Item Name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <p className="text-gray-400 text-center mt-20">No orders found</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedHistory.map((order , index) => {
              const statusBadge = getStatusBadge(order.status);
              const subtotal = Number(order.subtotal ?? 0);
              const manualDiscount = order.items.reduce((s, i) => {
                if (i.original_price != null && i.original_price > i.price) {
                  return s + (i.original_price - i.price) * i.qty;
                }
                return s;
              }, 0);
              const orderDiscount = order.discount_amount || 0;
              const taxAmount = order.tax_amount || 0;
              return (
                <div key={index} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col justify-between">
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => toggleOrderDetails(order)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Order #{order.id}</span>
                        <span className="text-2xl text-gray-400">
                          {expandedOrder === order.id ? "−" : "+"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {manualDiscount === 0 && (
                          <span className="text-sm">Slip :{order.id}</span>
                        )}
                        <span className={
                          `rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                            order.payment_type === 'Kapy' ? 'bg-blue-600 text-white' :
                            order.payment_type === 'Cash' ? 'bg-emerald-600 text-white' :
                            order.payment_type === 'FOC' ? 'bg-orange-500 text-white' :
                            order.payment_type && order.payment_type.toLowerCase().includes('coupon') ? 'bg-fuchsia-600 text-white' :
                            'bg-slate-100 text-slate-800'
                          }
                        `}
                        >
                          {order.payment_type || 'N/A'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}<br/>
                      {new Date(order.created_at).toLocaleTimeString()}
                    </span>

                    <ul className="border-t border-b py-2 text-sm max-h-48 overflow-y-auto">
                      {order.items.length === 0 ? (
                        <li className="py-2 text-gray-400">No item data available for this order.</li>
                      ) : order.items.map((item, idx) => {
                        const origTotal = item.original_price != null ? item.original_price * item.qty : item.price * item.qty;
                        const itemDisc = item.original_price != null ? (item.original_price - item.price) * item.qty : 0;
                        return (
                        <li key={idx} className="flex justify-between py-1 border-b last:border-b-0">
                          <span>
                            {item.menu_name}
                            {item.isSet && <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">SET</span>}
                            {' × '}{item.qty}
                            {itemDisc > 0 && <span className="ml-1 text-xs text-red-500">(-{mmkFormatter.format(itemDisc)})</span>}
                          </span>
                          <span>{mmkFormatter.format(origTotal)}</span>
                        </li>
                        );
                      })}
                    </ul>

                    {/* Expanded FIFO History Section */}
                    {expandedOrder === order.id && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="font-semibold text-sm text-slate-700 mb-2">FIFO Stock Consumption History</h4>
                        <div className="max-h-60 overflow-y-auto">
                          {(() => {
                            const allFifoRows = [];
                            Object.keys(fifoHistory[order.id] || {}).forEach((invId) => {
                              const rows = fifoHistory[order.id][invId] || [];
                              rows.forEach((row, rowIdx) => {
                                const isZeroQty = row.qty === 0;
                                allFifoRows.push(
                                  <tr key={`${invId}-${rowIdx}`} className={`${isZeroQty ? "bg-red-50 dark:bg-red-900/20" : ""}`}>
                                    <td className="py-2">{row.item_name || `Item ${invId}`}</td>
                                    <td className="py-2 capitalize">{row.source}</td>
                                    <td className="py-2">{row.date ? new Date(row.date).toLocaleDateString() : "-"}</td>
                                    <td className={`py-2 font-medium ${isZeroQty ? "text-red-600" : ""}`}>{row.qty}</td>
                                    <td className="py-2">
                                      {isZeroQty ? (
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Depleted</span>
                                      ) : (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">In Stock</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            });
                            return allFifoRows.length > 0 ? (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="pb-2 text-left">Item</th>
                                    <th className="pb-2 text-left">Source</th>
                                    <th className="pb-2 text-left">Date</th>
                                    <th className="pb-2 text-left">Remaining Qty</th>
                                    <th className="pb-2 text-left">Status</th>
                                  </tr>
                                </thead>
                                <tbody>{allFifoRows}</tbody>
                              </table>
                            ) : (
                              <p className="text-gray-500 text-center py-4">No FIFO history available</p>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Price Breakdown */}
                    <div className="mt-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{mmkFormatter.format(subtotal)}</span>
                      </div>
                      {manualDiscount > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Sub Discount:</span>
                          <span>-{mmkFormatter.format(manualDiscount)}</span>
                        </div>
                      )}
                      {orderDiscount > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span>Discount ({order.discount_percent}%){order.discount_type ? ` ${order.discount_type}` : ''}:</span>
                          <span>-{mmkFormatter.format(orderDiscount)}</span>
                        </div>
                      )}
                      {taxAmount > 0 && (
                        <div className="flex justify-between text-blue-500">
                          <span>Tax:</span>
                          <span>+{mmkFormatter.format(taxAmount)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <span className="font-bold text-lg">Total: {mmkFormatter.format(order.total)}</span>
                  </div>
                  {order.status === 'completed' && (
                    <div className="mt-2 p-2 rounded bg-green-50 border border-green-100 text-sm">
                      <div className="flex justify-between">
                        <span className="font-semibold text-green-500">Completed</span>
                        <span className="text-xs text-gray-500">{order.completed_at ? new Date(order.completed_at).toLocaleString() : ''}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-700">By: {order.completed_by_name || order.completed_by || '-'}</div>
                    </div>
                  )}
                  {order.status === 'cancelled' && (
                    <div className="mt-2 p-3 rounded border border-red-200 text-sm">
                      <div className="font-semibold text-red-700">Cancelled</div>
                      <div className="text-xs text-gray-600 mt-1">{order.cancelled_at ? new Date(order.cancelled_at).toLocaleString() : ''}</div>
                      <div className="mt-2 text-sm text-slate-700">By: {order.cancelled_by_name || order.cancelled_by || '-'}</div>
                      {order.cancel_note && <div className="mt-1 text-sm text-slate-700">Note: {order.cancel_note}</div>}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    {canEditHistory && (
                      <button
                        onClick={() => handleOpenEdit(order)}
                        className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-xl hover:bg-indigo-700 transition"
                      >
                        Edit
                      </button>
                    )}
                    {order.status === 'completed' && (
                      <button
                        onClick={() => printReceipt(order)}
                        className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-xl hover:bg-blue-700 transition"
                      >
                        Print
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <>
                        {canComplete && (
                          <button
                            onClick={() => handleComplete(order)}
                            className="flex-1 bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 transition"
                          >
                            Complete
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => handleCancel(order)}
                            className="flex-1 bg-red-500 text-white px-3 py-2 rounded-xl hover:bg-red-600 transition"
                          >
                            Cancel
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex justify-center items-center gap-3 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 transition"
              disabled={page === 1}
            >
              Prev
            </button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button
              onClick={() => {
                if (page < totalPages) {
                  setPage((p) => Math.min(p + 1, totalPages));
                } else if (hasMore) {
                  fetchHistory(true);
                }
              }}
              className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 transition"
              disabled={page === totalPages && !hasMore}
            >
              {loadingMore ? "Loading..." : "Next"}
            </button>
          </div>
        </>
      )}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Order History</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Payment Type
              </label>
              <select
                name="payment_type"
                value={editForm.payment_type}
                onChange={handleEditFormChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select payment type</option>
                <option value="Kapy">Kapy</option>
                <option value="Cash">Cash</option>
                <option value="FOC">FOC</option>
                <option value="Coupon">Coupon</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Status
              </label>
              <select
                name="status"
                value={editForm.status}
                onChange={handleEditFormChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
