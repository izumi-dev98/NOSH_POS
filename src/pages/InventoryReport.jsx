import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import supabase from "../createClients";
import { calculateFifoValue } from "../utils/fifoService";

export default function InventoryReport() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Date filter: "all", "day", "week", "month", "year"
  const [dateFilter, setDateFilter] = useState("all");

  // Custom date range
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareData, setCompareData] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Modal state for purchase details
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });
  const toFiniteNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const formatMMK = (value) => mmkFormatter.format(toFiniteNumber(value));
  const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
  const normalizeType = (value) => {
    const normalized = value?.toString().trim().toLowerCase();
    return normalized || "-";
  };
  const buildItemKey = (itemName, itemType) => `${normalizeName(itemName)}::${normalizeType(itemType)}`;
  const buildNameOnlyKey = (itemName) => `${normalizeName(itemName)}::*`;

  // Store purchase price history per item (latest first)
  const [priceHistoryByItem, setPriceHistoryByItem] = useState({});

  const getPriceHistory = (itemName, itemType) => {
    const exactKey = buildItemKey(itemName, itemType);
    const fallbackKey = buildNameOnlyKey(itemName);
    return priceHistoryByItem[exactKey]?.length
      ? priceHistoryByItem[exactKey]
      : (priceHistoryByItem[fallbackKey] || []);
  };

  const getLatestUnitPrice = (itemName, itemType) => {
    const history = getPriceHistory(itemName, itemType);
    const price = history[0];
    return price !== undefined && price !== null ? Number(price) : null;
  };

  const getEffectiveUnitPrice = (itemName, itemType, inventoryPrice) => {
    const latest = getLatestUnitPrice(itemName, itemType);
    if (latest !== null) return latest;
    return inventoryPrice !== undefined && inventoryPrice !== null
      ? Number(inventoryPrice) || 0
      : 0;
  };

  const getLayerTotalValue = (itemName, itemType, qty, inventoryPrice) => {
    // FIFO valuation: value remaining qty using price history (newest first)
    // Under FIFO, oldest layers are consumed first, so newest layers remain
    const numericQty = Number(qty) || 0;
    if (numericQty <= 0) return 0;

    const history = getPriceHistory(itemName, itemType);
    const fallbackPrice = inventoryPrice !== undefined && inventoryPrice !== null
      ? Number(inventoryPrice) || 0
      : 0;

    // If price history is empty, use fallback price
    if (!history || history.length === 0) {
      return numericQty * fallbackPrice;
    }

    return calculateFifoValue(numericQty, history, fallbackPrice);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Fetch compare data when compare mode is enabled and dates are set
  useEffect(() => {
    if (compareMode && compareFrom && compareTo) {
      fetchCompareData(compareFrom, compareTo);
    }
  }, [compareMode, compareFrom, compareTo]);

  const fetchInventory = async () => {
    setLoading(true);

    // Get all received purchases with dates for FIFO ordering
    const { data: purchases } = await supabase
      .from("purchases")
      .select("id, date, created_at")
      .eq("status", "received");

    const receivedPurchaseIds = purchases?.map(p => p.id) || [];

    // Build a map of purchase_id to date for FIFO ordering
    const purchaseDateMap = {};
    purchases?.forEach(p => {
      purchaseDateMap[p.id] = p.created_at || p.date;
    });

    // Get add_stock records from internal_consumption with dates
    const { data: addStockRecords } = await supabase
      .from("internal_consumption")
      .select("id, created_at")
      .eq("status", "add_stock");

    const addStockIds = addStockRecords?.map(r => r.id) || [];

    // Build a map of consumption_id to date for FIFO ordering
    const addStockDateMap = {};
    addStockRecords?.forEach(r => {
      addStockDateMap[r.id] = r.created_at;
    });

    const [invData, supData, purchaseItemsData, addStockItemsData] = await Promise.all([
      supabase.from("inventory").select("*").order("item_name", { ascending: true }),
      supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
      receivedPurchaseIds.length > 0
        ? supabase.from("purchase_items").select("item_name, type, qty, foc_qty, unit_price, purchase_id").in("purchase_id", receivedPurchaseIds)
        : Promise.resolve({ data: [] }),
      addStockIds.length > 0
        ? supabase.from("internal_consumption_items").select("inventory_id, qty, foc_qty, unit_price, consumption_id").in("consumption_id", addStockIds)
        : Promise.resolve({ data: [] })
    ]);

    if (!invData.error) setInventory(invData.data);
    if (!supData.error) setSuppliers(supData.data || []);

    // Build FIFO price history per item based on REMAINING layers
    // purchase_items.qty already reflects remaining qty after consumption
    // We need to expand each layer into individual unit prices for calculateFifoValue
    const priceHistory = {};

    // Helper: add a layer's prices to history array
    const addLayerToHistory = (key, unitPrice, remainingQty) => {
      if (!priceHistory[key]) priceHistory[key] = [];
      const qty = parseFloat(remainingQty) || 0;
      if (qty <= 0) return;
      // Add one price entry per remaining unit in this layer
      for (let i = 0; i < qty; i++) {
        priceHistory[key].push(unitPrice);
      }
    };

    // Process purchase_items - need to sort by purchase date first
    if (purchaseItemsData.data && purchases) {
      // Enrich items with purchase date for sorting
      const itemsWithDate = purchaseItemsData.data
        .filter(item => {
          const remainingQty = parseFloat(item.qty) || 0;
          return remainingQty > 0 && item.unit_price && parseFloat(item.unit_price) > 0;
        })
        .map(item => ({
          ...item,
          purchaseDate: purchaseDateMap[item.purchase_id] || null,
          timestamp: purchaseDateMap[item.purchase_id] ? new Date(purchaseDateMap[item.purchase_id]).getTime() : Infinity
        }));

      // Sort by date (oldest first) for proper FIFO layer ordering
      itemsWithDate.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // Build price history (oldest layers first, will reverse later)
      itemsWithDate.forEach(item => {
        const nameKey = normalizeName(item.item_name);
        if (nameKey) {
          const exactKey = buildItemKey(item.item_name, item.type);
          const fallbackKey = buildNameOnlyKey(item.item_name);
          addLayerToHistory(exactKey, item.unit_price, item.qty);
          addLayerToHistory(fallbackKey, item.unit_price, item.qty);
        }
      });
    }

    // Process add_stock items - sort by date
    if (addStockItemsData.data && invData.data && addStockRecords) {
      const inventoryMap = {};
      invData.data.forEach(inv => {
        inventoryMap[inv.id] = {
          exactKey: buildItemKey(inv.item_name, inv.type),
          fallbackKey: buildNameOnlyKey(inv.item_name),
        };
      });

      // Enrich items with date for sorting
      const itemsWithDate = addStockItemsData.data
        .filter(item => {
          const remainingQty = parseFloat(item.qty) || 0;
          return remainingQty > 0 && item.unit_price && parseFloat(item.unit_price) > 0;
        })
        .map(item => ({
          ...item,
          addStockDate: addStockDateMap[item.consumption_id] || null,
          timestamp: addStockDateMap[item.consumption_id] ? new Date(addStockDateMap[item.consumption_id]).getTime() : Infinity
        }));

      // Sort by date (oldest first)
      itemsWithDate.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });

      // Build price history (oldest layers first)
      itemsWithDate.forEach(item => {
        const keyPair = inventoryMap[item.inventory_id];
        if (keyPair) {
          addLayerToHistory(keyPair.exactKey, item.unit_price, item.qty);
          addLayerToHistory(keyPair.fallbackKey, item.unit_price, item.qty);
        }
      });
    }

    // Reverse so newest layers are first (these remain after FIFO consumption)
    Object.keys(priceHistory).forEach(key => {
      priceHistory[key].reverse();
    });

    setPriceHistoryByItem(priceHistory);
    setLoading(false);
  };

  // Fetch daily transactions (Add/Reduce) between two dates
  const fetchCompareData = async (fromDate, toDate) => {
    if (!fromDate || !toDate) {
      console.log('Missing dates:', { fromDate, toDate });
      return;
    }

    setCompareLoading(true);

    try {
      // Get all inventory items
      const { data: allInventory } = await supabase
        .from('inventory')
        .select('id, item_name, type, price');

      if (!allInventory || allInventory.length === 0) {
        setCompareData([]);
        setCompareLoading(false);
        return;
      }

      // Get purchases in date range (use created_at for consistency)
      const { data: purchases, error: purchasesError } = await supabase
        .from('purchases')
        .select('id, date, created_at, status')
        .gte('created_at', fromDate)
        .lte('created_at', toDate + 'T23:59:59');

      console.log('Purchases:', purchases?.length || 0, 'error:', purchasesError);
      const purchaseIds = purchases?.map(p => p.id) || [];

      // Get add_stock in date range (use created_at instead of date)
      const { data: addStockRecords } = await supabase
        .from('internal_consumption')
        .select('id, created_at, status')
        .eq('status', 'add_stock')
        .gte('created_at', fromDate)
        .lte('created_at', toDate + 'T23:59:59');

      const addStockIds = addStockRecords?.map(r => r.id) || [];

      // Get usage/consumption in date range - get all non-add_stock records
      const { data: usageRecords } = await supabase
        .from('internal_consumption')
        .select('id, created_at, status')
        .gte('created_at', fromDate)
        .lte('created_at', toDate + 'T23:59:59')
        .neq('status', 'add_stock');

      const usageIds = usageRecords?.map(r => r.id) || [];

      // Get purchase return items in date range
      const { data: returnItems, error: returnItemsError } = await supabase
        .from('purchase_return_items')
        .select('id, inventory_id, qty, created_at')
        .gte('created_at', fromDate)
        .lte('created_at', toDate + 'T23:59:59');

      console.log('Return items:', returnItems?.length || 0, 'error:', returnItemsError);
      let returnItemsData = [];
      if (!returnItemsError && returnItems) {
        returnItemsData = returnItems;
      }

      // Initialize data structure for each inventory item
      const itemTransactions = {};
      allInventory.forEach(inv => {
        itemTransactions[inv.id] = {
          inventory_id: inv.id,
          item_name: inv.item_name,
          type: inv.type,
          price: inv.price,
          received_qty: 0,      // From purchases (received status)
          added_qty: 0,         // From add_stock
          reduced_qty: 0,       // From usage/consumption
          returned_qty: 0,      // From purchase returns
          net_change: 0,
        };
      });

      // Fetch purchase_items (all purchases, not just received)
      if (purchaseIds.length > 0) {
        const { data: purchaseItems, error: purchaseItemsError } = await supabase
          .from('purchase_items')
          .select('item_name, type, qty, foc_qty, purchase_id')
          .in('purchase_id', purchaseIds);

        console.log('Purchase items:', purchaseItems?.length || 0, 'error:', purchaseItemsError);

        if (purchaseItems) {
          purchaseItems.forEach(pi => {
            // Match by item_name and type
            const inv = allInventory.find(i =>
              i.item_name.toLowerCase() === pi.item_name.toLowerCase() &&
              (i.type || '').toLowerCase() === (pi.type || '').toLowerCase()
            );
            if (inv && itemTransactions[inv.id]) {
              itemTransactions[inv.id].received_qty += (parseFloat(pi.qty) || 0) + (parseFloat(pi.foc_qty) || 0);
            }
          });
        }
      }

      // Fetch add_stock items
      if (addStockIds.length > 0) {
        const { data: addStockItems } = await supabase
          .from('internal_consumption_items')
          .select('inventory_id, qty, foc_qty, consumption_id')
          .in('consumption_id', addStockIds);

        if (addStockItems) {
          addStockItems.forEach(ai => {
            if (itemTransactions[ai.inventory_id]) {
              itemTransactions[ai.inventory_id].added_qty += (parseFloat(ai.qty) || 0);
            }
          });
        }
      }

      // Fetch usage items
      if (usageIds.length > 0) {
        const { data: usageItems } = await supabase
          .from('internal_consumption_items')
          .select('inventory_id, qty, consumption_id')
          .in('consumption_id', usageIds);

        if (usageItems) {
          usageItems.forEach(ui => {
            if (itemTransactions[ui.inventory_id]) {
              itemTransactions[ui.inventory_id].reduced_qty += (parseFloat(ui.qty) || 0);
            }
          });
        }
      }

      // Fetch purchase return items (already fetched above with date filter)
      if (returnItemsData && returnItemsData.length > 0) {
        returnItemsData.forEach(ri => {
          if (itemTransactions[ri.inventory_id]) {
            itemTransactions[ri.inventory_id].returned_qty += (parseFloat(ri.qty) || 0);
          }
        });
      }

      // Calculate net change and build comparison array
      const comparison = Object.values(itemTransactions).map(item => {
        const netChange = item.received_qty + item.added_qty - item.reduced_qty - item.returned_qty;
        const totalQty = item.received_qty + item.added_qty;
        const changePercent = totalQty > 0 ? ((netChange / totalQty) * 100).toFixed(1) : 0;

        return {
          inventory_id: item.inventory_id,
          item_name: item.item_name,
          type: item.type,
          received_qty: item.received_qty,
          added_qty: item.added_qty,
          reduced_qty: item.reduced_qty,
          returned_qty: item.returned_qty,
          change_qty: netChange,
          change_percent: parseFloat(changePercent),
          unit_price: item.price || 0,
        };
      });

      // Filter to only show items with transactions
      const filteredComparison = comparison.filter(item =>
        item.received_qty > 0 ||
        item.added_qty > 0 ||
        item.reduced_qty > 0 ||
        item.returned_qty > 0
      );

      // Sort by item name
      filteredComparison.sort((a, b) => (a.item_name || '').localeCompare(b.item_name || ''));

      console.log('Daily transactions:', filteredComparison.length, 'items with activity');
      setCompareData(filteredComparison);
    } catch (err) {
      console.error('Error fetching compare data:', err);
      setCompareData([]);
    } finally {
      setCompareLoading(false);
    }
  };

  // View stock history for an item (Purchase + Add Stock mixed, sorted by date oldest first)
  const viewPurchaseHistory = async (item) => {
    setSelectedItem(item);

    const getFifoTimestamp = (value) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
    };

    // Use the item directly since it comes from inventory table
    const targetInv = item;
    const targetName = normalizeName(targetInv.item_name);
    const targetType = normalizeType(targetInv.type);
    const targetId = item.id;

    // Fetch ALL purchases (not just received/returned) to include invoice info
    const { data: allPurchases, error: purchasesErr } = await supabase
      .from("purchases")
      .select("id, date, created_at, invoice_number, supplier_id, status")
      .order("created_at", { ascending: true });

    if (purchasesErr) {
      console.error("Error fetching purchases:", purchasesErr);
    }

    const allPurchaseIds = allPurchases?.map(p => p.id) || [];

    // Fetch add_stock records ordered by date (FIFO)
    const { data: addStockRecords, error: addStockErr } = await supabase
      .from("internal_consumption")
      .select("id, created_at")
      .eq("status", "add_stock")
      .order("created_at", { ascending: true });

    if (addStockErr) {
      console.error("Error fetching add_stock records:", addStockErr);
    }

    const addStockIds = addStockRecords?.map(r => r.id) || [];

    const history = [];

    // Add purchase items - fetch ALL purchase_items to get current qty after returns
    if (allPurchaseIds.length > 0) {
      const { data: purchaseItems, error: purchaseItemsErr } = await supabase
        .from("purchase_items")
        .select("id, qty, foc_qty, unit_price, purchase_id, item_name, type, original_qty, expiry_date")
        .in("purchase_id", allPurchaseIds);

      if (purchaseItemsErr) {
        console.error("Error fetching purchase_items:", purchaseItemsErr);
      }

      if (purchaseItems) {
        // Match by name and type (exact match first, fallback to name-only)
        const exactMatches = purchaseItems.filter((pi) =>
          normalizeName(pi.item_name) === targetName &&
          normalizeType(pi.type) === targetType
        );
        const matchedPurchaseItems = exactMatches.length > 0
          ? exactMatches
          : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

        matchedPurchaseItems.forEach(pi => {
          const purchase = allPurchases?.find(p => p.id === pi.purchase_id);
          if (purchase) {
            // Use created_at for FIFO (more accurate than date only)
            const fifoDate = purchase.created_at || purchase.date;
            // Current qty after returns (this is what gets updated when return is processed)
            const currentQty = parseFloat(pi.qty) || 0;
            // Use original_qty if available, otherwise it means no returns happened yet
            // so original_qty = current_qty (nothing returned)
            const originalQty = parseFloat(pi.original_qty) || currentQty;
            const returnedQty = originalQty - currentQty;

            history.push({
              ...pi,
              purchase_date: purchase.date || "-",
              fifo_date: fifoDate,
              invoice_number: purchase.invoice_number || "-",
              supplier_id: purchase.supplier_id,
              source_type: "Purchase",
              status: purchase.status || "received",
              qty: currentQty,
              original_qty: originalQty,
              returned_qty: returnedQty > 0 ? returnedQty : 0,
              foc_qty: parseFloat(pi.foc_qty) || 0,
              unit_price: parseFloat(pi.unit_price) || 0
            });
          }
        });
      }
    }

    // Add add_stock items - match by inventory_id
    if (addStockIds.length > 0) {
      const { data: addStockItems, error: addStockItemsErr } = await supabase
        .from("internal_consumption_items")
        .select("id, qty, foc_qty, unit_price, consumption_id, inventory_id")
        .in("consumption_id", addStockIds);

      if (addStockItemsErr) {
        console.error("Error fetching internal_consumption_items:", addStockItemsErr);
      }

      if (addStockItems) {
        const addStockMap = {};
        addStockRecords?.forEach(r => {
          addStockMap[r.id] = r.created_at;
        });

        const matchedAddStockItems = addStockItems.filter(ai => ai.inventory_id === targetId);

        matchedAddStockItems.forEach(ai => {
          const createdAt = addStockMap[ai.consumption_id];
          const qty = parseFloat(ai.qty) || 0;
          const focQty = parseFloat(ai.foc_qty) || 0;
          const billableQty = qty - focQty;
          const unitPrice = parseFloat(ai.unit_price) || 0;
          history.push({
            id: ai.id,
            item_name: targetInv.item_name,
            qty: qty,
            foc_qty: focQty,
            unit_price: unitPrice,
            total_price: billableQty * unitPrice,
            purchase_date: createdAt ? new Date(createdAt).toISOString().split('T')[0] : "-",
            fifo_date: createdAt || null,
            invoice_number: "-",
            supplier_id: null,
            source_type: "Add Stock",
            status: "add_stock"
          });
        });
      }
    }

    // Keep list in FIFO order for consistent usage-reduction tracing
    // Sorted by date/time only - earliest first
    history.sort((a, b) => {
      const tsA = getFifoTimestamp(a.fifo_date);
      const tsB = getFifoTimestamp(b.fifo_date);
      if (tsA !== tsB) return tsA - tsB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    setPurchaseHistory(history);
    setShowDetailModal(true);
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find(s => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Filter by date
  const filterByDate = (items) => {
    const now = new Date();

    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      return items.filter((item) => {
        const itemDate = item.created_at ? new Date(item.created_at) : null;
        return itemDate && itemDate >= start && itemDate <= end;
      });
    }

    switch (dateFilter) {
      case "day":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate &&
            itemDate.getDate() === now.getDate() &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getFullYear() === now.getFullYear();
        });
      case "week": {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate && itemDate >= weekAgo;
        });
      }
      case "month":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getFullYear() === now.getFullYear();
        });
      case "year":
        return items.filter((item) => {
          const itemDate = item.created_at ? new Date(item.created_at) : null;
          return itemDate && itemDate.getFullYear() === now.getFullYear();
        });
      default:
        return items;
    }
  };

  // Apply date filter then search filter (for non-compare mode)
  const dateFiltered = filterByDate(inventory);
  const filteredData = dateFiltered.filter((item) =>
    item.item_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Filter compare data by search
  const filteredCompareData = compareData.filter((item) =>
    item.item_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate totals - use layer totals (same basis as history modal)
  const totalItems = filteredData.length;
  const totalQty = filteredData.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0);
  const totalValue = filteredData.reduce((sum, item) => {
    return sum + getLayerTotalValue(item.item_name, item.type || item.unit, item.qty, item.price);
  }, 0);

  // Calculate compare mode totals (daily transactions)
  const compareTotalItems = filteredCompareData.length;
  const compareTotalReceived = filteredCompareData.reduce((sum, item) => sum + (item.received_qty || 0), 0);
  const compareTotalAdded = filteredCompareData.reduce((sum, item) => sum + (item.added_qty || 0), 0);
  const compareTotalReduced = filteredCompareData.reduce((sum, item) => sum + (item.reduced_qty || 0), 0);
  const compareTotalReturned = filteredCompareData.reduce((sum, item) => sum + (item.returned_qty || 0), 0);
  const compareTotalChange = filteredCompareData.reduce((sum, item) => sum + (item.change_qty || 0), 0);

  // Pagination logic
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentData = compareMode ? filteredCompareData.slice(indexOfFirst, indexOfLast) : filteredData.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil((compareMode ? filteredCompareData.length : filteredData.length) / rowsPerPage);

  // Export Excel
  const exportToExcel = () => {
    let exportData = [];
    let fileName = "Inventory_Report.xlsx";

    if (compareMode) {
      // Compare mode export - Daily Transactions
      exportData = filteredCompareData.map((item) => ({
        Item_Name: item.item_name,
        Unit: item.type,
        Received: item.received_qty,
        Added: item.added_qty,
        Reduced: item.reduced_qty,
        Returned: item.returned_qty,
        Net_Change: item.change_qty,
        Price: item.unit_price,
      }));

      // Add summary row
      exportData.push({
        Item_Name: "TOTAL",
        Unit: "",
        Received: compareTotalReceived,
        Added: compareTotalAdded,
        Reduced: compareTotalReduced,
        Returned: compareTotalReturned,
        Net_Change: compareTotalChange,
        Price: "",
      });

      fileName = `Inventory_Daily_${compareFrom}_to_${compareTo}.xlsx`;
    } else {
      // Regular mode export
      exportData = filteredData.map((item) => {
        const latestPrice = getEffectiveUnitPrice(item.item_name, item.type || item.unit, item.price);
        return {
          Item_Name: item.item_name,
          Quantity: item.qty,
          Unit: item.type,
          Price: latestPrice,
          Total_Value: getLayerTotalValue(item.item_name, item.type || item.unit, item.qty, item.price),
          Created_At: item.created_at ? new Date(item.created_at).toLocaleDateString() : "-",
        };
      });

      // Add summary row
      exportData.push({
        Item_Name: "TOTAL",
        Quantity: totalQty,
        Unit: "",
        Price: "",
        Total_Value: totalValue,
        Created_At: "",
      });
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory Report");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(fileData, fileName);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Report</h1>
          <p className="text-sm text-slate-500 mt-1">
            {compareMode
              ? `Compare: ${compareFrom || '...'} to ${compareTo || '...'}`
              : "View inventory report"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!compareMode) {
                // Auto-set dates when entering compare mode
                const today = new Date().toISOString().split('T')[0];
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                setCompareFrom(yesterday);
                setCompareTo(today);
              }
              setCompareMode(!compareMode);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              compareMode
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {compareMode ? "Comparison Mode" : "Compare Dates"}
          </button>

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

      {/* Compare Mode Date Pickers */}
      {compareMode && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">From:</label>
            <input
              type="date"
              value={compareFrom}
              onChange={(e) => {
                setCompareFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <label className="text-sm font-medium text-slate-700">To:</label>
            <input
              type="date"
              value={compareTo}
              onChange={(e) => {
                setCompareTo(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                setCompareFrom("");
                setCompareTo("");
                setCompareData([]);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Search and Filter (only show in non-compare mode) */}
      {!compareMode && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap gap-3">
            {/* Date Filter */}
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
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
            {dateFilter === "custom" && (
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

            {/* Search */}
            <input
              type="text"
              placeholder="Search item..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Search for compare mode */}
      {compareMode && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <input
            type="text"
            placeholder="Search item..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-md"
          />
        </div>
      )}

      {/* Summary Cards */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        {compareMode ? (
          <div className="grid grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-slate-500">Items with Activity</p>
              <p className="text-xl font-bold text-slate-800">{compareTotalItems}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Received</p>
              <p className="text-xl font-bold text-emerald-600">{compareTotalReceived}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Added</p>
              <p className="text-xl font-bold text-emerald-600">{compareTotalAdded}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Reduced</p>
              <p className="text-xl font-bold text-red-600">{compareTotalReduced}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Net Change</p>
              <p className={`text-xl font-bold ${
                compareTotalChange > 0 ? 'text-emerald-600' :
                compareTotalChange < 0 ? 'text-red-600' : 'text-slate-600'
              }`}>
                {compareTotalChange > 0 ? '+' : ''}{compareTotalChange}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Total Items</p>
              <p className="text-xl font-bold text-slate-800">{totalItems}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Value</p>
              <p className="text-xl font-bold text-emerald-600">{formatMMK(totalValue)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {compareMode ? (
          <>
            {/* Compare Mode Table - Daily Transactions */}
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-700">
                    Received
                    <span className="text-xs text-slate-500 font-normal block">(Purchase)</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-emerald-700">
                    Added
                    <span className="text-xs text-slate-500 font-normal block">(Add Stock)</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-red-700">
                    Reduced
                    <span className="text-xs text-slate-500 font-normal block">(Usage)</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-orange-700">
                    Returned
                    <span className="text-xs text-slate-500 font-normal block">(Return)</span>
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Net Change</th>
                </tr>
              </thead>

              <tbody>
                {compareLoading ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6">
                      Loading daily transactions...
                    </td>
                  </tr>
                ) : !compareFrom || !compareTo ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6">
                      Select 'From' and 'To' dates to compare
                    </td>
                  </tr>
                ) : filteredCompareData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6">
                      No transactions found in this period
                    </td>
                  </tr>
                ) : (
                  currentData.map((item, index) => {
                    const netChangeBg = item.change_qty > 0 ? 'bg-emerald-100 text-emerald-700' :
                                       item.change_qty < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';

                    return (
                      <tr
                        key={index}
                        className="border-b border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                      >
                        <td className="px-4 py-3 font-medium text-gray-700 dark:text-slate-100">
                          {item.item_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.type || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.received_qty > 0 ? (
                            <span className="text-emerald-600 font-medium">+{item.received_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.added_qty > 0 ? (
                            <span className="text-emerald-600 font-medium">+{item.added_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.reduced_qty > 0 ? (
                            <span className="text-red-600 font-medium">-{item.reduced_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.returned_qty > 0 ? (
                            <span className="text-orange-600 font-medium">-{item.returned_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${netChangeBg}`}>
                            {item.change_qty > 0 ? '+' : ''}{item.change_qty}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {/* Pagination for Compare Mode */}
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Prev
                </button>
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Regular Mode Table */}
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Latest Buying Price</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-6">Loading...</td>
                  </tr>
                ) : currentData.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-6">No Data Found</td>
                  </tr>
                ) : (
                  currentData.map((item, index) => (
                    <tr
                      key={index}
                      className="border-b border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                    >
                      <td className="px-4 py-3 font-medium text-gray-700 dark:text-slate-100">
                        <button
                          onClick={() => viewPurchaseHistory(item)}
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 underline"
                        >
                          {item.item_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 relative group">
                        {item.qty < 5 ? (
                          <>
                            <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold cursor-pointer animate-pulse">
                              {item.qty}
                            </span>
                            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-red-600 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition duration-300 shadow-lg z-10">
                              ⚠ Critical Stock Level<br />Only {item.qty} items remaining!
                            </div>
                          </>
                        ) : item.qty < 10 ? (
                          <>
                            <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-semibold cursor-pointer">
                              {item.qty}
                            </span>
                            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-44 bg-red-500 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition duration-300 shadow-lg z-10">
                              ⚠ Low Stock Alert<br />Only {item.qty} items remaining
                            </div>
                          </>
                        ) : (
                          <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm font-semibold">
                            {item.qty}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.type}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {formatMMK(getEffectiveUnitPrice(item.item_name, item.type || item.unit, item.price))}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">
                        {formatMMK(getLayerTotalValue(item.item_name, item.type || item.unit, item.qty, item.price))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {/* Pagination for Regular Mode */}
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1}
              </span>
              <div className="space-x-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Prev
                </button>
                <button
                  disabled={currentPage === totalPages || totalPages === 0}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Purchase History Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Purchase History</h3>
                <p className="text-sm text-slate-500">{selectedItem?.item_name}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Type</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Invoice #</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Date</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-300">Supplier</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">
                      <div className="flex flex-col text-xs">
                        <span>Qty</span>
                        <span className="text-slate-500">(Orig/Ret)</span>
                      </div>
                    </th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">FOC</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">Unit Price</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">Expiry Date</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseHistory.length > 0 ? (
                    purchaseHistory.map((item, idx) => {
                      const qty = parseFloat(item.qty) || 0;
                      const focQty = parseFloat(item.foc_qty) || 0;
                      const billableQty = qty - focQty;
                      const isZero = qty === 0;
                      // Total = (Qty - FOC) × Unit Price
                      const rowTotal =
                        toFiniteNumber(item.total_price) ||
                        (billableQty * (parseFloat(item.unit_price) || 0));
                      return (
                        <tr
                          key={idx}
                          className={`border-t border-slate-100 dark:border-slate-700 ${
                            isZero ? "bg-red-50 dark:bg-red-900/40" : ""
                          }`}
                        >
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.source_type === "Add Stock"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                            }`}>
                              {item.source_type || "Purchase"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-800 dark:text-slate-200 font-medium">{item.invoice_number}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{item.purchase_date}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{getSupplierName(item.supplier_id)}</td>
                          <td className="px-4 py-2 text-center">
                            <div className="flex flex-col items-center text-xs">
                              <span className={`font-medium ${item.qty === 0 ? "text-red-600" : "text-slate-600 dark:text-slate-400"}`}>
                                {item.qty}
                              </span>
                              <span className="text-slate-500 text-[10px]">
                                (Orig: {item.original_qty} / -{item.returned_qty || 0})
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {focQty > 0 ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{focQty}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{formatMMK(item.unit_price)}</td>
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
                          <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatMMK(rowTotal)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">No stock history found</td>
                    </tr>
                  )}
                </tbody>
                {purchaseHistory.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={8} className="px-4 py-2 text-right font-bold text-slate-800 dark:text-slate-200">Total (Excl. FOC)</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMMK(
                          purchaseHistory.reduce(
                            (sum, item) => {
                              const qty = parseFloat(item.qty) || 0;
                              const focQty = parseFloat(item.foc_qty) || 0;
                              const billableQty = qty - focQty;
                              const price = parseFloat(item.unit_price) || 0;
                              return sum + (billableQty * price);
                            },
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
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
                <h3 className="text-xl font-bold text-slate-800">
                  {compareMode ? "Inventory Daily Comparison Report" : "Inventory Report"}
                </h3>
                <p className="text-sm text-slate-500">
                  {compareMode
                    ? `Period: ${compareFrom || '...'} to ${compareTo || '...'}`
                    : `Generated: ${new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const printContent = document.getElementById('print-report-content');
                    if (!printContent) return;
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Inventory Report</title>
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
                            .badge-red { background: #fee2e2; color: #dc2626; }
                            .badge-green { background: #dcfce7; color: #16a34a; }
                            .badge-yellow { background: #fef9c3; color: #ca8a04; }
                            .emerald { color: #059669; }
                            .red { color: #dc2626; }
                            .orange { color: #ea580c; }
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
              <div id="print-report-content" className="p-4">
                <h1 className="text-lg font-bold text-slate-800 mb-1">
                  {compareMode ? "Inventory Daily Comparison Report" : "Inventory Report"}
                </h1>
                <p className="text-sm text-slate-500 mb-4">
                  {compareMode
                    ? `Period: ${compareFrom || '...'} to ${compareTo || '...'}`
                    : `Generated: ${new Date().toLocaleDateString('en-MM', { year: 'numeric', month: 'long', day: 'numeric' })}`}
                </p>

                <div className="overflow-x-auto">
                  {compareMode ? (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                          <th className="px-4 py-3 text-right font-semibold text-emerald-700">Received</th>
                          <th className="px-4 py-3 text-right font-semibold text-emerald-700">Added</th>
                          <th className="px-4 py-3 text-right font-semibold text-red-700">Reduced</th>
                          <th className="px-4 py-3 text-right font-semibold text-orange-700">Returned</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Net Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCompareData.length === 0 ? (
                          <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No transactions found</td></tr>
                        ) : (
                          filteredCompareData.map((item, index) => {
                            const netChangeBg = item.change_qty > 0 ? 'bg-emerald-100 text-emerald-700' :
                                               item.change_qty < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';
                            return (
                              <tr key={index} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                                <td className="px-4 py-3 font-medium text-slate-700">{item.item_name}</td>
                                <td className="px-4 py-3 text-slate-600">{item.type || '-'}</td>
                                <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                                  {item.received_qty > 0 ? `+${item.received_qty}` : <span className="text-slate-400">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                                  {item.added_qty > 0 ? `+${item.added_qty}` : <span className="text-slate-400">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-red-600 font-medium">
                                  {item.reduced_qty > 0 ? `-${item.reduced_qty}` : <span className="text-slate-400">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-orange-600 font-medium">
                                  {item.returned_qty > 0 ? `-${item.returned_qty}` : <span className="text-slate-400">-</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${netChangeBg}`}>
                                    {item.change_qty > 0 ? '+' : ''}{item.change_qty}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Item Name</th>
                          <th className="px-4 py-3 text-center font-semibold text-slate-700">Quantity</th>
                          <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Latest Price</th>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.length === 0 ? (
                          <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No data found</td></tr>
                        ) : (
                          filteredData.map((item, index) => (
                            <tr key={index} className="border-b border-slate-100 hover:bg-indigo-50 transition">
                              <td className="px-4 py-3 font-medium text-slate-700">{item.item_name}</td>
                              <td className="px-4 py-3 text-center">
                                {item.qty < 5 ? (
                                  <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold">{item.qty}</span>
                                ) : item.qty < 10 ? (
                                  <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-semibold">{item.qty}</span>
                                ) : (
                                  <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-sm font-semibold">{item.qty}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{item.type}</td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {formatMMK(getEffectiveUnitPrice(item.item_name, item.type || item.unit, item.price))}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-700">
                                {formatMMK(getLayerTotalValue(item.item_name, item.type || item.unit, item.qty, item.price))}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
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
