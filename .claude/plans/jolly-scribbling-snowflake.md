# Plan: Fix Inventory Report Main Table Value Using FIFO Cost Layers

## Context

The InventoryReport component's "Total Value" column is currently using a **simple latest price × qty** calculation (`getLayerTotalValue` function). This does not reflect the actual cost basis of inventory when items are purchased at different prices over time.

**Problem:** When inventory is consumed (via orders/usage), the system uses FIFO to deduct quantities from `purchase_items.qty` and `internal_consumption_items.qty`, but the valuation in the report uses the most recent purchase price for ALL remaining quantity, not the actual layer costs.

**User Requirement:** Use **FIFO Cost Layers** valuation - each unit should be valued at the price of its specific purchase layer.

## Current Behavior (Incorrect)

```javascript
// Latest price method - WRONG for FIFO
const getLayerTotalValue = (itemName, itemType, qty, inventoryPrice) => {
  const latestPrice = getEffectiveUnitPrice(itemName, itemType, inventoryPrice);
  return qty * latestPrice;  // Values ALL qty at the MOST RECENT price
};
```

## Target Behavior (Correct FIFO)

```javascript
// FIFO layer method - CORRECT
// Value = Sum of (remaining qty in each layer × that layer's unit price)
// Example:
//   Layer 1 (oldest): 10 units @ 100 MMK = 1,000
//   Layer 2: 5 units @ 120 MMK = 600
//   Layer 3 (newest): 3 units @ 110 MMK = 330
//   Total Value = 1,930 MMK (NOT 18 × 110 = 1,980)
```

## Implementation Approach

### Files to Modify

1. **`src/pages/InventoryReport.jsx`** - Main component

### Changes Required

1. **Import FIFO utilities** at the top:
   ```javascript
   import { buildFifoList } from "../utils/fifoService";
   ```

2. **Replace `getLayerTotalValue` function** with FIFO-based calculation:
   ```javascript
   const getFifoTotalValue = async (item) => {
     const fifoList = await buildFifoList(
       item.id,
       item.item_name,
       item.type || item.unit,
       { includePurchase: true, includeAddStock: true, onlyWithRemainingQty: true }
     );

     return fifoList.reduce((sum, layer) => {
       const billableQty = (layer.qty || 0) - (layer.foc_qty || 0);
       return sum + (billableQty * (layer.unit_price || 0));
     }, 0);
   };
   ```

3. **Update the `fetchInventory` useEffect** to pre-calculate FIFO values:
   - After fetching inventory, build FIFO lists for each item
   - Store FIFO totals in a state map for quick lookup
   - This avoids calling async functions during render

4. **Update the Total Value column** to use the pre-calculated FIFO value instead of `getLayerTotalValue`.

5. **Update the Export Excel function** to use FIFO values in the exported data.

6. **Update the summary card "Total Value"** to sum the FIFO values.

## Critical Considerations

### Performance
- Building FIFO lists for all items on every render would be slow
- Solution: Pre-calculate FIFO values when data is fetched, store in state
- Use a state variable like `fifoValueByItemId` to cache results

### FOC (Free on Charge) Items
- FOC items have zero price and should not affect valuation
- The FIFO calculation should exclude FOC qty: `billableQty = qty - foc_qty`

### Consistency with History Modal
- The purchase history modal already shows layers with their specific prices
- The Total Value should match what the user sees in the history modal

## Verification Steps

1. Open Inventory Report page
2. Click on an item to view its purchase history
3. Note the total value shown in the history modal footer
4. Verify the main table "Total Value" column matches (or sums correctly for multiple layers)
5. Export to Excel and verify the values match
6. Test with items that have:
   - Multiple purchase layers at different prices
   - Partial consumption (some layers partially used)
   - FOC items mixed with paid items
   - Add Stock entries

## Alternative Approaches Considered

1. **Call FIFO function directly in render** - Rejected due to performance concerns
2. **Use database-side calculation** - Would require backend changes, more complex
3. **Weighted average method** - User specifically requested FIFO, not average
