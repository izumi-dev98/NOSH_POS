import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { buildFifoList, deductFromFifo } from "../utils/fifoService";

export default function InternalConsumption({ inventory, setInventory }) {
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedAddItems, setSelectedAddItems] = useState([]);
  const [addStockCategories, setAddStockCategories] = useState([]);
  const [usageStockCategories, setUsageStockCategories] = useState([]);
  const [formData, setFormData] = useState({
    notes: "",
  });
  const [addFormData, setAddFormData] = useState({
    notes: "",
    date: new Date().toISOString().split('T')[0],
  });
  const [latestPrices, setLatestPrices] = useState({});
  const [loading, setLoading] = useState(false);

  // Filter states
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Search states
  const [itemSearch, setItemSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [usageItemPage, setUsageItemPage] = useState(1);
  const [addItemPage, setAddItemPage] = useState(1);
  const modalItemsPerPage = 10;

  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";
  const currentUsername = user?.username || "Unknown";

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  // Fetch consumption records
  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from("internal_consumption")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  // Fetch latest prices from purchase history
  const fetchLatestPrices = async () => {
    try {
      const { data: purchases } = await supabase
        .from("purchases")
        .select("id")
        .eq("status", "received");

      const receivedPurchaseIds = purchases?.map(p => p.id) || [];

      if (receivedPurchaseIds.length > 0) {
        const { data: purchaseItems } = await supabase
          .from("purchase_items")
          .select("item_name, unit_price")
          .in("purchase_id", receivedPurchaseIds)
          .order("id", { ascending: false });

        if (purchaseItems) {
          const prices = {};
          purchaseItems.forEach(item => {
            const key = item.item_name?.toLowerCase().trim();
            if (key && !prices[key]) {
              prices[key] = item.unit_price;
            }
          });
          setLatestPrices(prices);
        }
      }
    } catch (err) {
      console.error("Error fetching latest prices:", err);
    }
  };

  const fetchAddStockCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("add_stock_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setAddStockCategories(data || []);
    } catch (err) {
      console.error("Error fetching add stock categories:", err);
      setAddStockCategories([]);
    }
  };

  const fetchUsageStockCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("usage_stock_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setUsageStockCategories(data || []);
    } catch (err) {
      console.error("Error fetching usage stock categories:", err);
      setUsageStockCategories([]);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchLatestPrices();
    fetchAddStockCategories();
    fetchUsageStockCategories();
  }, []);

  // Filter records by date
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

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "add_stock" && record.status !== "add_stock") return false;
        if (statusFilter === "usage" && record.status !== "completed") return false;
      }

      // Record search filter
      if (recordSearch) {
        const searchLower = recordSearch.toLowerCase();
        const matchesId = record.id.toString().includes(searchLower);
        const matchesUser = record.user_name?.toLowerCase().includes(searchLower);
        const matchesNotes = record.notes?.toLowerCase().includes(searchLower);
        if (!matchesId && !matchesUser && !matchesNotes) return false;
      }

      return true;
    });
  }, [records, dateFilter, customStart, customEnd, recordSearch, statusFilter]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

  const toggleItemSelection = (item) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      const defaultUsageCategoryId = usageStockCategories?.[0]?.id ?? null;
      return [...prev, { ...item, usage_qty: "", reason: "", usage_stock_category_id: defaultUsageCategoryId }];
    });
  };

  const updateItemUsageQty = (itemId, qty) => {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, usage_qty: qty } : i,
      ),
    );
  };

  const updateItemReason = (itemId, reason) => {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, reason } : i,
      ),
    );
  };

  const updateItemUsageCategory = (itemId, categoryId) => {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, usage_stock_category_id: categoryId } : i,
      ),
    );
  };

  // Add Stock Functions
  const toggleAddItemSelection = (item) => {
    setSelectedAddItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      const itemKey = item.item_name?.toLowerCase().trim();
      const autoLatestPrice = latestPrices[itemKey] ?? item.price ?? 0;
      const defaultCategoryId = addStockCategories?.[0]?.id ?? null;
      return [...prev, {
        ...item,
        add_qty: "",
        add_price: autoLatestPrice,
        add_stock_category_id: defaultCategoryId,
      }];
    });
  };

  const updateItemAddQty = (itemId, qty) => {
    setSelectedAddItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, add_qty: qty } : i,
      ),
    );
  };

  const updateItemAddPrice = (itemId, price) => {
    setSelectedAddItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, add_price: price } : i,
      ),
    );
  };

  const updateItemAddCategory = (itemId, categoryId) => {
    setSelectedAddItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, add_stock_category_id: categoryId } : i,
      ),
    );
  };

  const handleAddStockSubmit = async (e) => {
    e.preventDefault();
    if (selectedAddItems.length === 0) {
      return Swal.fire("Error", "Please select at least one item", "error");
    }

    // Validate quantities
    for (const item of selectedAddItems) {
      const qty = item.add_qty === "" ? 0 : item.add_qty;
      if (!qty || qty <= 0) {
        return Swal.fire(
          "Error",
          `Please enter valid quantity for ${item.item_name}`,
          "error",
        );
      }
    }

    setLoading(true);
    try {
      const userName = currentUsername;

      // Create add stock record
      const { data: record, error: recordErr } = await supabase
        .from("internal_consumption")
        .insert([
          {
            notes: addFormData.notes,
            status: "add_stock",
            user_name: userName,
          },
        ])
        .select()
        .single();
      if (recordErr) throw recordErr;

      // Create records and add inventory
      for (const item of selectedAddItems) {
        const addQty = parseFloat(item.add_qty);
        const currentInv = inventory.find(inv => inv.id === item.id);
        const currentQty = currentInv ? currentInv.qty : 0;
        const itemKey = item.item_name?.toLowerCase().trim();
        const autoLatestPrice = latestPrices[itemKey] ?? item.price ?? 0;
        const enteredPrice = item.add_price;
        const addPrice =
          enteredPrice === "" || enteredPrice === null || enteredPrice === undefined
            ? (parseFloat(autoLatestPrice) || 0)
            : (parseFloat(enteredPrice) || 0);

        try {
          // Insert consumption item using manual price (or auto latest as fallback)
          const result = await supabase
            .from("internal_consumption_items")
            .insert({
              consumption_id: record.id,
              inventory_id: item.id,
              qty: addQty,
              unit_price: addPrice,
              add_stock_category_id: item.add_stock_category_id || null,
            });

          if (result.error) {
            console.error("Insert error:", result.error);
            alert(`Error saving item: ${result.error.message}`);
          }
        } catch (err) {
          console.error("Insert exception:", err);
        }

        // Add inventory and keep latest chosen price in inventory
        const newQty = currentQty + addQty;
        const updateData = { qty: newQty, price: addPrice };
        await supabase
          .from("inventory")
          .update(updateData)
          .eq("id", item.id);
      }

      // Refresh data
      await fetchRecords();

      // Update local inventory state
      const updatedInventory = inventory.map((inv) => {
        const added = selectedAddItems.find((s) => s.id === inv.id);
        if (added) {
          const chosenPrice =
            added.add_price === "" || added.add_price === null || added.add_price === undefined
              ? (parseFloat(latestPrices[added.item_name?.toLowerCase().trim()] ?? inv.price) || 0)
              : (parseFloat(added.add_price) || 0);
          return { ...inv, qty: inv.qty + parseFloat(added.add_qty), price: chosenPrice };
        }
        return inv;
      });
      setInventory(updatedInventory);

      Swal.fire("Success", "Stock added successfully!", "success");
      setShowAddModal(false);
      setSelectedAddItems([]);
      setAddFormData({
        notes: "",
        date: new Date().toISOString().split('T')[0],
      });
      fetchRecords();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      return Swal.fire("Error", "Please select at least one item", "error");
    }

    // Validate quantities
    for (const item of selectedItems) {
      const qty = item.usage_qty === "" ? 0 : item.usage_qty;
      if (!qty || qty <= 0) {
        return Swal.fire(
          "Error",
          `Please enter valid quantity for ${item.item_name}`,
          "error",
        );
      }
      if (qty > item.qty) {
        return Swal.fire(
          "Error",
          `Usage quantity cannot exceed available stock for ${item.item_name}`,
          "error",
        );
      }
    }

    setLoading(true);
    try {
      // Get user info from user table
      const userName = currentUsername;

      // Auto-build notes from item notes
      const itemNotes = selectedItems
        .filter((i) => i.reason)
        .map((i) => `${i.item_name}: ${i.reason}`);
      const combinedNotes = [formData.notes, ...itemNotes].filter(Boolean).join(" | ");

      // Create consumption record with user info
      const { data: record, error: recordErr } = await supabase
        .from("internal_consumption")
        .insert([
          {
            notes: combinedNotes,
            status: "completed",
            user_name: userName,
          },
        ])
        .select()
        .single();
      if (recordErr) throw recordErr;

      // Deduct from stock history using centralized FIFO service
      const deductFromStockHistory = async (itemId, itemName, itemType, usageQty) => {
        // Build FIFO list using centralized service
        const fifoList = await buildFifoList(itemId, itemName, itemType, {
          includePurchase: true,
          includeAddStock: true,
          onlyWithRemainingQty: false
        });

        console.log(`[Usage FIFO] Item: ${itemName}, Usage Qty: ${usageQty}`);
        console.log(`[Usage FIFO] Available layers:`, fifoList.map(l => ({
          source: l.source,
          id: l.id,
          qty: l.qty,
          unit_price: l.unit_price
        })));

        // Deduct from FIFO layers - automatically updates purchase_items/internal_consumption_items
        const fifoResult = await deductFromFifo(fifoList, usageQty);

        console.log(`[Usage FIFO] Result:`, {
          success: fifoResult.success,
          remaining: fifoResult.remaining,
          consumedLayers: fifoResult.consumedLayers.map(l => ({
            source: l.source,
            sourceId: l.sourceId,
            qtyConsumed: l.qtyConsumed,
            unitPrice: l.unitPrice
          }))
        });

        if (!fifoResult.success) {
          console.warn(`[Usage FIFO] Warning: ${fifoResult.remaining} units could not be allocated for ${itemName}`);
        }

        return fifoResult;
      };

      // Create consumption items and deduct inventory
      for (const item of selectedItems) {
        const usageQty = parseFloat(item.usage_qty);
        const currentInv = inventory.find(inv => inv.id === item.id);
        const currentQty = currentInv ? currentInv.qty : 0;

        await supabase.from("internal_consumption_items").insert({
          consumption_id: record.id,
          inventory_id: item.id,
          qty: usageQty,
          usage_stock_category_id: item.usage_stock_category_id || null,
        });

        // Deduct inventory from current inventory
        const newQty = currentQty - usageQty;
        await supabase
          .from("inventory")
          .update({ qty: newQty })
          .eq("id", item.id);

        // Deduct from stock history (FIFO - date/time order)
        await deductFromStockHistory(item.id, item.item_name, item.type || item.unit, usageQty);
      }

      // Update local inventory state
      const updatedInventory = inventory.map((inv) => {
        const used = selectedItems.find((s) => s.id === inv.id);
        if (used) {
          return { ...inv, qty: inv.qty - parseFloat(used.usage_qty) };
        }
        return inv;
      });
      setInventory(updatedInventory);

      Swal.fire("Success", "Usage recorded successfully!", "success");
      setShowModal(false);
      setSelectedItems([]);
      setFormData({ notes: "" });
      fetchRecords();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async (id) => {
    const result = await Swal.fire({
      title: "Delete this record?",
      text: "This will restore the inventory quantities",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
    });

    if (result.isConfirmed) {
      try {
        // Get items to restore inventory
        const { data: items } = await supabase
          .from("internal_consumption_items")
          .select("*")
          .eq("consumption_id", id);

        // Restore inventory
        for (const item of items || []) {
          const inv = inventory.find((i) => i.id === item.inventory_id);
          if (inv) {
            await supabase
              .from("inventory")
              .update({ qty: inv.qty + item.qty })
              .eq("id", item.inventory_id);
          }
        }

        // Delete items first
        await supabase
          .from("internal_consumption_items")
          .delete()
          .eq("consumption_id", id);

        // Delete record
        await supabase.from("internal_consumption").delete().eq("id", id);

        Swal.fire(
          "Deleted!",
          "Record deleted and inventory restored",
          "success",
        );
        fetchRecords();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  // Fetch items for each record
  const fetchRecordItems = async (recordId) => {
    const { data } = await supabase
      .from("internal_consumption_items")
      .select("*")
      .eq("consumption_id", recordId);
    return data || [];
  };

  const [expandedRecord, setExpandedRecord] = useState(null);
  const [recordItems, setRecordItems] = useState({});
  const [fifoHistory, setFifoHistory] = useState({});

  const toggleRecordDetails = async (record) => {
    if (expandedRecord === record.id) {
      setExpandedRecord(null);
    } else {
      setExpandedRecord(record.id);
      // Always fetch fresh data when expanding
      const items = await fetchRecordItems(record.id);
      setRecordItems((prev) => ({ ...prev, [record.id]: items }));

      // Fetch FIFO history for each item
      const historyMap = {};
      for (const item of items) {
        const history = await fetchFifoHistory(item.inventory_id, item.id, record.status);
        historyMap[item.inventory_id] = history;
      }
      setFifoHistory((prev) => ({ ...prev, [record.id]: historyMap }));
    }
  };

  const fetchFifoHistory = async (inventoryId, consumptionItemId, recordStatus) => {
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
                source: "purchase"
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
                  source: "add_stock"
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

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Internal Consumption</h1>
          <p className="text-sm text-slate-500 mt-1">Manage stock and usage</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowAddModal(true);
              setAddItemPage(1);
            }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Stock
          </button>
          <button
            onClick={() => {
              setShowModal(true);
              setUsageItemPage(1);
            }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            - Usage
          </button>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-2xl shadow p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search records..."
              value={recordSearch}
              onChange={(e) => {
                setRecordSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Date</label>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
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
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 border rounded-xl"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border rounded-xl"
            >
              <option value="all">All Status</option>
              <option value="add_stock">Add Stock</option>
              <option value="usage">Usage</option>
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-600">
            Showing {filteredRecords.length} record(s)
          </div>
        </div>
      </div>

      {/* Records List */}
      {filteredRecords.length === 0 ? (
        <p className="text-gray-500 text-center mt-10">
          No consumption records found
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedRecords.map((record) => (
              <div key={record.id} className="bg-white rounded-2xl shadow p-4">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleRecordDetails(record)}
                >
                  <div>
                    <p className="font-semibold">Record #{record.id}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(record.created_at).toLocaleString()}
                    </p>
                    {record.user_name && (
                      <p className="text-sm text-blue-600">
                        Used by: {record.user_name}
                      </p>
                    )}
                    {record.notes && (
                      <p className="text-sm text-gray-600 mt-1">
                        Notes: {record.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium px-2 py-1 rounded ${
                      record.status === "add_stock"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {record.status === "add_stock" ? "Add Stock" : "Usage"}
                    </span>
                    <span className="text-2xl">
                      {expandedRecord === record.id ? "−" : "+"}
                    </span>
                  </div>
                </div>

                {expandedRecord === record.id && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="font-semibold text-sm text-slate-700 mb-2">FIFO Stock Consumption History</h4>
                    <table className="w-full text-sm mb-4">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="pb-2">Source</th>
                          <th className="pb-2">Date</th>
                          <th className="pb-2">Original Qty</th>
                          <th className="pb-2">Remaining Qty</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((fifoHistory[record.id] || {})[(recordItems[record.id] || [])[0]?.inventory_id] || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-gray-500">
                              No FIFO history available
                            </td>
                          </tr>
                        ) : (
                          (fifoHistory[record.id] || {})[(recordItems[record.id] || [])[0]?.inventory_id]?.map((row, idx) => {
                            const isZeroQty = row.qty === 0;
                            return (
                              <tr key={idx} className={`border-t ${isZeroQty ? "bg-red-50 dark:bg-red-900/20" : ""}`}>
                                <td className="py-2 capitalize">{row.source}</td>
                                <td className="py-2">{row.date ? new Date(row.date).toLocaleDateString() : "-"}</td>
                                <td className="py-2">{row.qty}</td>
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
                          })
                        )}
                      </tbody>
                    </table>
                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Record Items</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-2">Item</th>
                          <th className="pb-2">{record.status === "add_stock" ? "Before" : "Before"}</th>
                          <th className="pb-2">{record.status === "add_stock" ? "Added" : "Used"}</th>
                          <th className="pb-2">Closing Qty</th>
                          <th className="pb-2">Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recordItems[record.id] || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-gray-500">
                              No items found for this record
                            </td>
                          </tr>
                        ) : (
                          (recordItems[record.id] || []).map((item, idx) => {
                            const inv = inventory.find(
                              (i) => i.id === item.inventory_id,
                            );
                            const isAddStock = record.status === "add_stock";
                            const isAdd = item.type === "add" || isAddStock;
                            const beforeQty = isAdd ? (inv?.qty || 0) - item.qty : (inv?.qty || 0) + item.qty;
                            const afterQty = inv ? inv.qty : 0;
                            return (
                              <tr key={idx} className="border-t">
                                <td className="py-2">
                                  {inv?.item_name || `Item ID: ${item.inventory_id}`}
                                </td>
                                <td className="py-2">{beforeQty}</td>
                                <td className={`py-2 ${isAdd ? "text-green-600" : "text-red-600"}`}>
                                  {isAdd ? "+" : "-"}{item.qty}
                                </td>
                                <td className="py-2">{afterQty}</td>
                                <td className="py-2">{inv?.type || "-"}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    {isSuperAdmin && (
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={() => deleteRecord(record.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded-xl hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
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

      {/* Record Usage Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4">Internal Usage</h3>

            {!isSuperAdmin && (
              <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 rounded">
                Note: You can view inventory and record usage. Only superadmin
                can edit inventory directly.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Inventory Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Items *
                </label>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setUsageItemPage(1);
                  }}
                  className="w-full px-3 py-2 border rounded-xl mb-2"
                />
                {(() => {
                  const filteredItems = inventory.filter(item =>
                    item.item_name.toLowerCase().includes(itemSearch.toLowerCase())
                  );
                  const totalUsageItemPages = Math.max(1, Math.ceil(filteredItems.length / modalItemsPerPage));
                  const usageStart = (usageItemPage - 1) * modalItemsPerPage;
                  const usageItemsPageData = filteredItems.slice(
                    usageStart,
                    usageStart + modalItemsPerPage,
                  );

                  return (
                    <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-xl p-2">
                  {usageItemsPageData.map((item) => {
                    const isSelected = selectedItems.some(
                      (s) => s.id === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItemSelection(item)}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? "bg-blue-50 border-blue-500 dark:bg-blue-900/30 dark:border-blue-400"
                            : "hover:bg-gray-50 dark:hover:bg-slate-700/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-sm text-gray-500">
                              Available: {item.qty} {item.unit}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-5 h-5"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filteredItems.length > modalItemsPerPage && (
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Page {usageItemPage} of {totalUsageItemPages}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUsageItemPage((p) => Math.max(1, p - 1))}
                        disabled={usageItemPage === 1}
                        className="px-3 py-1 border rounded-lg disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setUsageItemPage((p) => Math.min(totalUsageItemPages, p + 1))}
                        disabled={usageItemPage === totalUsageItemPages}
                        className="px-3 py-1 border rounded-lg disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                    </>
                  );
                })()}
              </div>

              {/* Usage Quantities */}
              {selectedItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Usage Quantity & Note
                  </label>
                  <div className="space-y-3">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="p-3 bg-gray-50 rounded-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.item_name}</p>
                            <p className="text-sm text-gray-500">
                              Stock: {item.qty} {item.unit}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 min-w-45">
                            <label className="text-xs font-medium text-slate-600">Usage Stock Category</label>
                            <select
                              value={item.usage_stock_category_id || ""}
                              onChange={(e) => updateItemUsageCategory(item.id, e.target.value ? Number(e.target.value) : null)}
                              className="w-full px-3 py-2 border rounded-xl text-sm"
                            >
                              <option value="">Select category</option>
                              {usageStockCategories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max={item.qty}
                            value={item.usage_qty}
                            onChange={(e) =>
                              updateItemUsageQty(
                                item.id,
                                e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                              )
                            }
                            className="w-24 px-2 py-1 border rounded-xl text-sm"
                            placeholder="Enter qty"
                          />
                          <span className="text-sm text-gray-500 w-12">
                            {item.unit}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={item.reason || ""}
                          onChange={(e) => updateItemReason(item.id, e.target.value)}
                          className="w-full px-3 py-1.5 border rounded-xl text-sm"
                          placeholder="Add note..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setSelectedItems([]);
                    setFormData({ notes: "" });
                    setItemSearch("");
                    setUsageItemPage(1);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded-xl hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedItems.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4">Add Stock</h3>

            {!isSuperAdmin && (
              <p className="text-sm text-gray-600 mb-4 bg-yellow-50 p-2 rounded">
                Note: You can view inventory and add stock. Only superadmin can edit inventory directly.
              </p>
            )}

            <form onSubmit={handleAddStockSubmit} className="space-y-4">
              {/* Inventory Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Items *
                </label>
                <input
                  type="text"
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    setAddItemPage(1);
                  }}
                  className="w-full px-3 py-2 border rounded-xl mb-2"
                />
                {(() => {
                  const filteredItems = inventory.filter(item =>
                    item.item_name.toLowerCase().includes(itemSearch.toLowerCase())
                  );
                  const totalAddItemPages = Math.max(1, Math.ceil(filteredItems.length / modalItemsPerPage));
                  const addStart = (addItemPage - 1) * modalItemsPerPage;
                  const addItemsPageData = filteredItems.slice(
                    addStart,
                    addStart + modalItemsPerPage,
                  );

                  return (
                    <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-xl p-2">
                  {addItemsPageData.map((item) => {
                    const isSelected = selectedAddItems.some(
                      (s) => s.id === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleAddItemSelection(item)}
                        className={`p-3 rounded-xl border cursor-pointer transition ${
                          isSelected
                            ? "bg-green-50 border-green-500 dark:bg-emerald-900/30 dark:border-emerald-400"
                            : "hover:bg-gray-50 dark:hover:bg-slate-700/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-sm text-gray-500">
                              Current Stock: {item.qty} {item.type}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-5 h-5"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filteredItems.length > modalItemsPerPage && (
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                    <span>Page {addItemPage} of {totalAddItemPages}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAddItemPage((p) => Math.max(1, p - 1))}
                        disabled={addItemPage === 1}
                        className="px-3 py-1 border rounded-lg disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddItemPage((p) => Math.min(totalAddItemPages, p + 1))}
                        disabled={addItemPage === totalAddItemPages}
                        className="px-3 py-1 border rounded-lg disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                    </>
                  );
                })()}
              </div>

              {/* Add Quantities */}
              {selectedAddItems.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Quantity *
                  </label>
                  <div className="space-y-2">
                    {selectedAddItems.map((item) => {
                      const latestPrice = latestPrices[item.item_name?.toLowerCase().trim()];
                      const displayPrice = latestPrice ?? item.price ?? 0;
                      return (
                        <div key={item.id} className="flex flex-col gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.item_name}</p>
                              <p className="text-xs text-gray-500">
                                Auto Price: {displayPrice ? mmkFormatter.format(displayPrice) : "-"}
                              </p>
                              <p className="text-xs text-gray-500">
                                Current Stock: {item.qty} {item.type}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 min-w-45">
                              <label className="text-xs font-medium text-slate-600">Add Stock Category</label>
                              <select
                                value={item.add_stock_category_id || ""}
                                onChange={(e) => updateItemAddCategory(item.id, e.target.value ? Number(e.target.value) : null)}
                                className="w-full px-3 py-2 border rounded-xl text-sm"
                              >
                                <option value="">Select category</option>
                                {addStockCategories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.add_price ?? displayPrice}
                              onChange={(e) =>
                                updateItemAddPrice(
                                  item.id,
                                  e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-28 px-2 py-1 border rounded-lg text-sm"
                              placeholder="Price"
                            />
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={item.add_qty}
                              onChange={(e) =>
                                updateItemAddQty(
                                  item.id,
                                  e.target.value === "" ? "" : parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-20 px-2 py-1 border rounded-lg text-sm"
                              placeholder="Qty"
                            />
                            <span className="text-xs text-gray-500 w-8">{item.type}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Date (Disabled - Current Date) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={addFormData.date}
                  disabled
                  className="w-full px-3 py-2 border rounded-xl bg-gray-100 text-gray-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={addFormData.notes}
                  onChange={(e) =>
                    setAddFormData({ ...addFormData, notes: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl"
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedAddItems([]);
                    setAddFormData({
                      notes: "",
                      date: new Date().toISOString().split('T')[0],
                    });
                    setItemSearch("");
                    setAddItemPage(1);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded-xl hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || selectedAddItems.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
