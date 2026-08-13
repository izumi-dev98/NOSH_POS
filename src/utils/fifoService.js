import supabase from "../createClients";

/**
 * FIFO Inventory Service
 * Centralized service for First-In-First-Out inventory cost tracking
 */

/**
 * Convert a date value to a timestamp for FIFO ordering
 * @param {string|Date} value - Date value to convert
 * @returns {number} - Timestamp or Infinity if invalid
 */
export const getFifoTimestamp = (value) => {
  if (!value) return Number.POSITIVE_INFINITY;
  let ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return ts;
};

/**
 * Normalize item name for comparison
 * @param {string} value - Item name to normalize
 * @returns {string} - Normalized lowercase trimmed name
 */
export const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";

/**
 * Normalize item type/unit for comparison
 * @param {string} value - Type to normalize
 * @returns {string} - Normalized type or "-" if empty
 */
export const normalizeType = (value) => {
  const normalized = value?.toString().trim().toLowerCase();
  return normalized || "-";
};

/**
 * Build a FIFO list for a specific inventory item
 * @param {number} inventoryId - Inventory item ID
 * @param {string} itemName - Inventory item name
 * @param {string} itemType - Inventory item type/unit
 * @param {Object} options - Options for filtering sources
 * @returns {Promise<Array>} - Array of FIFO layers sorted by date (oldest first)
 */
export const buildFifoList = async (inventoryId, itemName, itemType, options = {}) => {
  const {
    includePurchase = true,
    includeAddStock = true,
    onlyWithRemainingQty = true
  } = options;

  const getFifoTimestampLocal = (value) => {
    if (!value) return Number.POSITIVE_INFINITY;
    let ts = new Date(value).getTime();
    if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
    return ts;
  };

  const targetName = normalizeName(itemName);
  const targetType = normalizeType(itemType);

  const fifoList = [];

  // Fetch purchases if included
  if (includePurchase) {
    const { data: purchases, error: purchasesErr } = await supabase
      .from("purchases")
      .select("id, date, created_at, status")
      .in("status", ["received", "returned"]);

    if (!purchasesErr && purchases) {
      const purchaseIds = purchases.map(p => p.id);

      if (purchaseIds.length > 0) {
        const { data: purchaseItems, error: itemsErr } = await supabase
          .from("purchase_items")
          .select("id, qty, original_qty, foc_qty, unit_price, purchase_id, item_name, type, expiry_date, is_expired")
          .in("purchase_id", purchaseIds);

        if (!itemsErr && purchaseItems) {
          const exactMatches = purchaseItems.filter((pi) =>
            normalizeName(pi.item_name) === targetName &&
            normalizeType(pi.type) === targetType
          );
          const matchedPurchaseItems = exactMatches.length > 0
            ? exactMatches
            : purchaseItems.filter((pi) => normalizeName(pi.item_name) === targetName);

          matchedPurchaseItems.forEach(pi => {
            // Skip expired items
            if (pi.is_expired) return;
            const today = new Date().toISOString().split("T")[0];
            if (pi.expiry_date && pi.expiry_date <= today) return;

            const purchase = purchases.find(p => p.id === pi.purchase_id);
            const fifoDate = purchase?.created_at || purchase?.date;
            const currentQty = parseFloat(pi.qty) || 0;

            if (!onlyWithRemainingQty || currentQty > 0) {
              fifoList.push({
                id: pi.id,
                qty: currentQty,
                original_qty: parseFloat(pi.original_qty) || currentQty,
                foc_qty: parseFloat(pi.foc_qty) || 0,
                unit_price: parseFloat(pi.unit_price) || 0,
                date: fifoDate,
                fifoTimestamp: getFifoTimestampLocal(fifoDate),
                source: "purchase",
                purchase_id: pi.purchase_id,
                item_name: pi.item_name,
                type: pi.type
              });
            }
          });
        }
      }
    }
  }

  // Fetch add_stock items if included
  if (includeAddStock) {
    const { data: addStockRecords, error: addStockErr } = await supabase
      .from("internal_consumption")
      .select("id, created_at")
      .eq("status", "add_stock");

    if (!addStockErr && addStockRecords) {
      const addStockIds = addStockRecords.map(r => r.id);

      if (addStockIds.length > 0) {
        const { data: addStockItems, error: itemsErr } = await supabase
          .from("internal_consumption_items")
          .select("id, qty, foc_qty, unit_price, consumption_id, inventory_id")
          .in("consumption_id", addStockIds);

        if (!itemsErr && addStockItems) {
          addStockItems.forEach(ai => {
            if (ai.inventory_id === inventoryId) {
              const addStock = addStockRecords.find(r => r.id === ai.consumption_id);
              const currentQty = parseFloat(ai.qty) || 0;

              if (!onlyWithRemainingQty || currentQty > 0) {
                fifoList.push({
                  id: ai.id,
                  qty: currentQty,
                  foc_qty: parseFloat(ai.foc_qty) || 0,
                  unit_price: parseFloat(ai.unit_price) || 0,
                  date: addStock?.created_at || null,
                  fifoTimestamp: getFifoTimestampLocal(addStock?.created_at),
                  source: "add_stock",
                  consumption_id: ai.consumption_id,
                  inventory_id: ai.inventory_id
                });
              }
            }
          });
        }
      }
    }
  }

  // Sort by FIFO timestamp (oldest first), then by ID as tiebreaker
  fifoList.sort((a, b) => {
    if (a.fifoTimestamp !== b.fifoTimestamp) return a.fifoTimestamp - b.fifoTimestamp;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  return fifoList;
};

/**
 * Deduct quantity from FIFO layers
 * @param {Array} fifoList - Array of FIFO layers (will be mutated)
 * @param {number} qtyToDeduct - Quantity to deduct
 * @returns {Promise<Object>} - Result with success status and details of layers consumed
 */
export const deductFromFifo = async (fifoList, qtyToDeduct) => {
  let remaining = qtyToDeduct;
  const consumedLayers = [];

  for (const row of fifoList) {
    if (remaining <= 0) break;

    const currentQty = row.qty;
    const unitPrice = row.unit_price;
    if (currentQty <= 0) continue;

    const consumeQty = Math.min(currentQty, remaining);
    const newQty = currentQty - consumeQty;

    // Track what was consumed
    consumedLayers.push({
      source: row.source,
      sourceId: row.id,
      qtyConsumed: consumeQty,
      unitPrice: unitPrice,
      totalValue: consumeQty * unitPrice,
      remainingQty: newQty
    });

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

    // Update the fifoList in place
    row.qty = newQty;
    remaining -= consumeQty;
  }

  return {
    success: remaining <= 0,
    remaining,
    consumedLayers
  };
};

/**
 * Restore quantity to FIFO layers (for cancellations/returns)
 * @param {Array} fifoList - Array of FIFO layers to restore to (sorted oldest first)
 * @param {number} qtyToRestore - Quantity to restore
 * @returns {Promise<Object>} - Result with success status and details of layers restored
 */
export const restoreToFifo = async (fifoList, qtyToRestore) => {
  let remaining = qtyToRestore;
  const restoredLayers = [];

  // Restore to the same layers they came from (in reverse - newest first for returns)
  for (let i = fifoList.length - 1; i >= 0 && remaining > 0; i--) {
    const row = fifoList[i];
    const originalQty = row.original_qty || row.qty;

    // Calculate how much was consumed from this layer originally
    const wasConsumedQty = originalQty - row.qty;
    if (wasConsumedQty <= 0) continue;

    const restoreQty = Math.min(wasConsumedQty, remaining);
    const newQty = row.qty + restoreQty;

    restoredLayers.push({
      source: row.source,
      sourceId: row.id,
      qtyRestored: restoreQty,
      unitPrice: row.unit_price,
      totalValue: restoreQty * row.unit_price,
      newQty: newQty
    });

    // Update the appropriate table
    if (row.source === "purchase") {
      const { error: updateErr } = await supabase
        .from("purchase_items")
        .update({
          qty: newQty,
          total_price: newQty * row.unit_price,
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

    // Update the fifoList in place
    row.qty = newQty;
    remaining -= restoreQty;
  }

  return {
    success: remaining <= 0,
    remaining,
    restoredLayers
  };
};

/**
 * Calculate FIFO value for a given quantity using price history
 * @param {number} qty - Quantity to value
 * @param {Array} priceHistory - Array of unit prices (latest first)
 * @param {number} fallbackPrice - Fallback price if history is empty
 * @returns {number} - Total FIFO value
 */
export const calculateFifoValue = (qty, priceHistory, fallbackPrice = 0) => {
  const numericQty = Number(qty) || 0;

  if (numericQty <= 0) return 0;

  const fullUnits = Math.floor(numericQty);
  const remainder = numericQty - fullUnits;
  let total = 0;

  for (let i = 0; i < fullUnits; i += 1) {
    const unitPrice = priceHistory[i] !== undefined && priceHistory[i] !== null
      ? Number(priceHistory[i]) || 0
      : fallbackPrice;
    total += unitPrice;
  }

  if (remainder > 0) {
    const remainderUnitPrice = priceHistory[fullUnits] !== undefined && priceHistory[fullUnits] !== null
      ? Number(priceHistory[fullUnits]) || 0
      : (priceHistory[0] !== undefined && priceHistory[0] !== null
          ? Number(priceHistory[0]) || fallbackPrice
          : fallbackPrice);
    total += remainderUnitPrice * remainder;
  }

  return total;
};

/**
 * Get the total remaining quantity for an item across all FIFO layers
 * @param {string} itemName - Item name
 * @param {string} itemType - Item type
 * @returns {Promise<number>} - Total remaining quantity
 */
export const getTotalRemainingQty = async (itemName, itemType) => {
  const fifoList = await buildFifoList(0, itemName, itemType, {
    includePurchase: true,
    includeAddStock: true,
    onlyWithRemainingQty: false
  });

  return fifoList.reduce((sum, layer) => sum + (layer.qty || 0), 0);
};

/**
 * Get detailed FIFO layer information for reporting
 * @param {string} itemName - Item name
 * @param {string} itemType - Item type
 * @returns {Promise<Array>} - Array of FIFO layer details
 */
export const getFifoLayerDetails = async (itemName, itemType) => {
  const fifoList = await buildFifoList(0, itemName, itemType, {
    includePurchase: true,
    includeAddStock: true,
    onlyWithRemainingQty: false
  });

  return fifoList.map(layer => ({
    source: layer.source,
    sourceId: layer.id,
    date: layer.date,
    originalQty: layer.original_qty || layer.qty,
    remainingQty: layer.qty,
    consumedQty: (layer.original_qty || layer.qty) - layer.qty,
    unitPrice: layer.unit_price,
    totalValue: layer.qty * layer.unit_price,
    purchaseId: layer.purchase_id,
    invoiceNumber: layer.purchase_id ? `Purchase #${layer.purchase_id}` : null
  }));
};

export default {
  getFifoTimestamp,
  normalizeName,
  normalizeType,
  buildFifoList,
  deductFromFifo,
  restoreToFifo,
  calculateFifoValue,
  getTotalRemainingQty,
  getFifoLayerDetails
};
