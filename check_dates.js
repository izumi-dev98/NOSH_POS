const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://gtvfahmaygedbdbzylxy.supabase.co",
  "sb_publishable_Z3rNkQLisZQe7kio7tzKfA_vaQKrc-z"
);

async function checkDates() {
  console.log("=".repeat(60));
  console.log("PURCHASE RECORDS (ordered by date):");
  console.log("=".repeat(60));

  const { data: purchases, error: pErr } = await supabase
    .from("purchases")
    .select("id, date, invoice_number, status")
    .eq("status", "received")
    .order("date", { ascending: true })
    .limit(10);

  if (pErr) console.log("Error:", pErr);
  else if (purchases) {
    purchases.forEach(p => {
      console.log(`ID: ${p.id}, Date: ${p.date}, Invoice: ${p.invoice_number}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("ADD STOCK RECORDS (ordered by created_at):");
  console.log("=".repeat(60));

  const { data: addStock, error: aErr } = await supabase
    .from("internal_consumption")
    .select("id, created_at, status, notes")
    .eq("status", "add_stock")
    .order("created_at", { ascending: true })
    .limit(10);

  if (aErr) console.log("Error:", aErr);
  else if (addStock) {
    addStock.forEach(a => {
      const date = new Date(a.created_at).toISOString().split('T')[0];
      console.log(`ID: ${a.id}, Created: ${a.created_at}, Date Only: ${date}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("PURCHASE_ITEMS (with item names):");
  console.log("=".repeat(60));

  const { data: purchaseItems, error: piErr } = await supabase
    .from("purchase_items")
    .select("id, item_name, qty, purchase_id")
    .order("id", { ascending: true })
    .limit(10);

  if (piErr) console.log("Error:", piErr);
  else if (purchaseItems) {
    purchaseItems.forEach(pi => {
      console.log(`ID: ${pi.id}, Item: ${pi.item_name}, Qty: ${pi.qty}, PurchaseID: ${pi.purchase_id}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("INTERNAL_CONSUMPTION_ITEMS (add_stock):");
  console.log("=".repeat(60));

  const addStockIds = addStock ? addStock.map(a => a.id) : [];

  if (addStockIds.length > 0) {
    const { data: consItems, error: ciErr } = await supabase
      .from("internal_consumption_items")
      .select("id, inventory_id, qty, consumption_id, unit_price")
      .in("consumption_id", addStockIds)
      .order("id", { ascending: true })
      .limit(10);

    if (ciErr) console.log("Error:", ciErr);
    else if (consItems) {
      consItems.forEach(ci => {
        console.log(`ID: ${ci.id}, InventoryID: ${ci.inventory_id}, Qty: ${ci.qty}, ConsumptionID: ${ci.consumption_id}`);
      });
    }
  }
}

checkDates();
