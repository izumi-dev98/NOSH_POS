import supabase from "../createClients";

/**
 * Expiry Service
 * Automatically processes expired purchase items and reduces inventory.
 */

/**
 * Fetch purchase items that have expired (expiry_date <= today)
 * and still have remaining qty.
 */
export const fetchExpiringPurchaseItems = async () => {
  const today = new Date().toISOString().split("T")[0];

  const { data: items, error } = await supabase
    .from("purchase_items")
    .select("id, item_name, qty, expiry_date, purchase_id")
    .lte("expiry_date", today)
    .gt("qty", 0)
    .eq("is_expired", false)
    .not("expiry_date", "is", null);

  if (error) throw error;

  // Filter to only include items from received purchases
  if (!items || items.length === 0) return [];

  const purchaseIds = [...new Set(items.map((i) => i.purchase_id))];
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, status")
    .in("id", purchaseIds);

  const receivedIds = new Set((purchases || []).filter((p) => p.status === "received").map((p) => p.id));

  return items.filter((i) => receivedIds.has(i.purchase_id));
};

export const fetchExpiringSoonPurchaseItems = async (daysAhead = 7) => {
  const todayDate = new Date();
  const today = todayDate.toISOString().split("T")[0];

  const cutoffDate = new Date(todayDate);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() + daysAhead);
  const cutoff = cutoffDate.toISOString().split("T")[0];

  const { data: items, error } = await supabase
    .from("purchase_items")
    .select("id, item_name, qty, expiry_date, purchase_id")
    .gt("expiry_date", today)
    .lte("expiry_date", cutoff)
    .gt("qty", 0)
    .eq("is_expired", false)
    .not("expiry_date", "is", null);

  if (error) throw error;

  if (!items || items.length === 0) return [];

  const purchaseIds = [...new Set(items.map((i) => i.purchase_id))];
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, status")
    .in("id", purchaseIds);

  const receivedIds = new Set((purchases || []).filter((p) => p.status === "received").map((p) => p.id));

  return items.filter((i) => receivedIds.has(i.purchase_id));
};

/**
 * Process a list of expired purchase items:
 * - Deduct remaining qty from inventory
 * - Mark purchase item as expired (qty=0, is_expired=true)
 * - Log to expiry_log table
 */
export const processExpiredItems = async (expiredItems) => {
  const results = [];

  for (const item of expiredItems) {
    const expiredQty = parseFloat(item.qty) || 0;
    if (expiredQty <= 0) continue;

    // Find inventory record
    const { data: existing } = await supabase
      .from("inventory")
      .select("id, qty")
      .ilike("item_name", item.item_name.trim())
      .maybeSingle();

    if (existing) {
      // Reduce inventory (clamp at 0)
      const newQty = Math.max(0, (existing.qty || 0) - expiredQty);
      await supabase
        .from("inventory")
        .update({ qty: newQty })
        .eq("id", existing.id);
    }

    // Mark purchase item as expired
    await supabase
      .from("purchase_items")
      .update({ qty: 0, is_expired: true, total_price: 0 })
      .eq("id", item.id);

    // Log to expiry_log
    await supabase
      .from("expiry_log")
      .insert({
        purchase_item_id: item.id,
        item_name: item.item_name,
        expired_qty: expiredQty,
        expiry_date: item.expiry_date,
        purchase_id: item.purchase_id
      });

    results.push({
      item_name: item.item_name,
      expired_qty: expiredQty,
      expiry_date: item.expiry_date
    });
  }

  return results;
};

/**
 * Main entry point — run on app load.
 * Finds expired items, processes them, and returns a summary.
 */
export const runExpiryCheck = async () => {
  try {
    const expiredItems = await fetchExpiringPurchaseItems();
    if (expiredItems.length === 0) return null;

    const results = await processExpiredItems(expiredItems);
    return results;
  } catch (err) {
    console.error("Expiry check failed:", err);
    return null;
  }
};

/**
 * Fetch expiry log records for reporting.
 */
export const getExpiryLog = async () => {
  const { data, error } = await supabase
    .from("expiry_log")
    .select("*")
    .order("expired_at", { ascending: false });

  if (error) throw error;
  return data || [];
};

export default {
  runExpiryCheck,
  getExpiryLog,
  fetchExpiringPurchaseItems,
  fetchExpiringSoonPurchaseItems,
  processExpiredItems
};
