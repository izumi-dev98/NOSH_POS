import supabase from "../createClients";

export const upsertDailyMovement = async ({
  inventoryId,
  movementDate,
  changes = {},
}) => {
  if (!inventoryId) return null;

  const date = movementDate || new Date().toISOString().split("T")[0];

  const { data: latestPriorMovement, error: priorMovementError } = await supabase
    .from("daily_inventory_movements")
    .select("movement_date, closing_qty")
    .eq("inventory_id", inventoryId)
    .lt("movement_date", date)
    .order("movement_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorMovementError) throw priorMovementError;

  const { data: openingRecord, error: openingError } = await supabase
    .from("opening_inventory")
    .select("opening_qty, opening_date")
    .eq("inventory_id", inventoryId)
    .lte("opening_date", date)
    .order("opening_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openingError) throw openingError;

  const { data: existing, error: fetchError } = await supabase
    .from("daily_inventory_movements")
    .select("*")
    .eq("inventory_id", inventoryId)
    .eq("movement_date", date)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const effectiveOpeningQty = Number(
    existing?.opening_qty
      ?? latestPriorMovement?.closing_qty
      ?? openingRecord?.opening_qty
      ?? 0
  );

  const next = {
    inventory_id: Number(inventoryId),
    movement_date: date,
    opening_qty: effectiveOpeningQty,
    purchase_qty: Number(existing?.purchase_qty ?? 0),
    add_stock_qty: Number(existing?.add_stock_qty ?? 0),
    adjust_qty: Number(existing?.adjust_qty ?? 0),
    sale_usage_qty: Number(existing?.sale_usage_qty ?? 0),
    internal_usage_qty: Number(existing?.internal_usage_qty ?? 0),
    closing_qty: Number(existing?.closing_qty ?? effectiveOpeningQty),
  };

  const increment = {
    opening_qty: Number(changes.opening_qty ?? 0),
    purchase_qty: Number(changes.purchase_qty ?? 0),
    add_stock_qty: Number(changes.add_stock_qty ?? 0),
    adjust_qty: Number(changes.adjust_qty ?? 0),
    sale_usage_qty: Number(changes.sale_usage_qty ?? 0),
    internal_usage_qty: Number(changes.internal_usage_qty ?? 0),
  };

  Object.entries(increment).forEach(([key, value]) => {
    next[key] = Number(next[key] || 0) + Number(value || 0);
  });

  next.closing_qty =
    Number(next.opening_qty || 0) +
    Number(next.purchase_qty || 0) +
    Number(next.add_stock_qty || 0) +
    Number(next.adjust_qty || 0) -
    Number(next.sale_usage_qty || 0) -
    Number(next.internal_usage_qty || 0);

  // Ensure closing_qty is never negative
  next.closing_qty = Math.max(0, Number(next.closing_qty));

  const { error: saveError } = await supabase
    .from("daily_inventory_movements")
    .upsert(next, { onConflict: "inventory_id,movement_date" });

  if (saveError) throw saveError;

  return next;
};
