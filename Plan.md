# FIFO Inventory Management System Plan

## Context

The user wants a unified FIFO inventory management system where:
1. All stock reductions (Payment Orders/sales, Purchase Returns, Usage/internal consumption) consume the **oldest available stock first**
2. The **total price in purchase history** and **total value in inventory report** remain consistent regardless of how items are reduced
3. Purchase Return reports show **detailed return process information** for both full and partial returns

The current codebase has a POS/restaurant system with Supabase backend, React frontend, and existing FIFO logic for order completion and internal consumption. However, the FIFO implementation is fragmented across multiple files and doesn't uniformly apply to all reduction types.

---

## Problem Statement

Current issues identified:
1. **Inconsistent FIFO application**: Purchase Returns reduce inventory directly without consuming specific FIFO layers
2. **Value tracking gaps**: Inventory total value calculation doesn't account for cost flow when items are reduced via different processes
3. **Return reporting**: Purchase return details are shown but don't clearly indicate which FIFO batches were affected

---

## Architecture Overview

### Existing Components
| Component | Purpose | FIFO Logic |
|-----------|---------|------------|
| `InternalConsumption.jsx` | Stock adjustments, usage recording | Full FIFO implementation |
| `History.jsx` | Order completion | FIFO deduction on complete |
| `InventoryReport.jsx` | Valuation, price history | FIFO value calculation |
| `PurchaseReturn.jsx` | Return processing | Direct qty reduction (NO FIFO) |
| `PurchaseReport.jsx` | Purchase history | Displays returned qty |

### Database Tables Involved
- `inventory` - Current stock levels
- `purchases` / `purchase_items` - Purchase orders with `qty`, `unit_price`, `original_qty`
- `internal_consumption` / `internal_consumption_items` - Usage/add-stock records
- `purchase_returns` / `purchase_return_items` - Return records
- `orders` / `order_items` - Customer orders

---

## Implementation Approach

### Phase 1: Create Unified FIFO Service Layer

**File**: `src/utils/fifoService.js` (NEW)

Extract and centralize FIFO logic into a reusable service:

```javascript
// Core functions to extract:
- getFifoTimestamp(value)
- buildFifoList(itemId, sources) // purchase, add_stock
- deductFromFifo(fifoList, qtyToDeduct)
- restoreToFifo(fifoList, qtyToRestore)
- calculateFifoValue(qty, priceHistory)
```

**Benefits**:
- Single source of truth for FIFO logic
- Consistent behavior across all reduction types
- Easier testing and maintenance

---

### Phase 2: Update Purchase Return to Use FIFO

**File**: `src/pages/PurchaseReturn.jsx`

**Changes**:
1. Import `fifoService`
2. Replace direct `inventory.qty` reduction with `deductFromFifo()` call
3. Track which FIFO layers were consumed in `purchase_return_fifo` table (NEW)

**New Table Schema** (`purchase_return_fifo.sql`):
```sql
CREATE TABLE purchase_return_fifo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_item_id UUID REFERENCES purchase_return_items(id),
  source_type VARCHAR(20), -- 'purchase' or 'add_stock'
  source_id UUID,
  qty_reduced NUMERIC,
  unit_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Phase 3: Add Cost Flow Tracking Table

**File**: `inventory_fifo_layers.sql` (NEW)

For proper cost accounting, create a table that tracks remaining FIFO layers:

```sql
CREATE TABLE inventory_fifo_layers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID REFERENCES inventory(id),
  source_type VARCHAR(20), -- 'purchase' or 'add_stock'
  source_id UUID, -- purchase_item_id or consumption_item_id
  remaining_qty NUMERIC,
  unit_price NUMERIC,
  fifo_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fifo_layers_date ON inventory_fifo_layers(fifo_date);
CREATE INDEX idx_fifo_layers_inventory ON inventory_fifo_layers(inventory_id);
```

This table is:
- **Populated** when stock is added (purchase complete, add_stock)
- **Consumed** when stock is reduced (order, return, usage)
- **Queried** for inventory valuation

---

### Phase 4: Update Inventory Valuation

**File**: `src/pages/InventoryReport.jsx`

**Changes**:
1. `getTotalValueByQty()` should query `inventory_fifo_layers` for actual remaining costs
2. Add modal showing which FIFO layers remain for each item
3. Ensure "Total Value" column matches sum of `remaining_qty * unit_price` from layers

---

### Phase 5: Enhance Purchase Return Report

**File**: `src/pages/PurchaseReport.jsx` (or new `PurchaseReturnReport.jsx`)

**Changes**:
1. Add "Return Details" modal showing:
   - Which items were returned
   - Which FIFO layers were consumed (date, qty, unit price)
   - Total value returned
2. Link returns to original purchase invoices
3. Show partial vs. full return status per line item

---

### Phase 6: Update Order Completion (Payment Orders)

**File**: `src/pages/History.jsx`

**Changes**:
1. Use centralized `fifoService.deductFromFifo()` instead of inline logic
2. Log FIFO consumption to `inventory_fifo_layers`
3. Ensure consistency with return/usage processes

---

## Critical Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/utils/fifoService.js` | CREATE | Centralized FIFO logic |
| `inventory_fifo_layers.sql` | CREATE | FIFO layer tracking table |
| `purchase_return_fifo.sql` | CREATE | Return-FIFO linkage table |
| `src/pages/PurchaseReturn.jsx` | MODIFY | Use FIFO for reductions |
| `src/pages/InventoryReport.jsx` | MODIFY | Accurate valuation from layers |
| `src/pages/History.jsx` | MODIFY | Use centralized FIFO service |
| `src/pages/PurchaseReport.jsx` | MODIFY | Enhanced return details |

---

## Verification Steps

1. **Setup**: Run new SQL migrations to create tracking tables
2. **Purchase Return Test**:
   - Create a purchase with 10 units @ 100 MMK (oldest)
   - Create another purchase with 10 units @ 150 MMK (newest)
   - Process return for 5 units
   - Verify: Return consumes from oldest layer (100 MMK)
   - Verify: `inventory_fifo_layers` shows 5 remaining @ 100 MMK, 10 @ 150 MMK
3. **Usage Test**:
   - Record internal usage for 3 units
   - Verify: Consumes from oldest layer
   - Verify: Remaining layers updated correctly
4. **Order Completion Test**:
   - Complete an order requiring 2 units
   - Verify: FIFO consumption matches return/usage pattern
5. **Valuation Test**:
   - Check Inventory Report "Total Value"
   - Manually calculate: (remaining_qty_1 * price_1) + (remaining_qty_2 * price_2) + ...
   - Verify: Matches reported total value
6. **Return Report Test**:
   - View Purchase Return details
   - Verify: Shows which FIFO layers were consumed
   - Verify: Distinguishes full vs. partial returns per item

---

## Key Design Decisions

1. **FIFO Layer Table**: Instead of recalculating FIFO on every operation, maintain a live view of remaining layers
2. **Centralized Service**: Prevents code duplication and ensures consistent behavior
3. **Return-FIFO Linkage**: Explicitly track which layers each return consumed for audit trail
4. **Backward Compatibility**: Existing data continues to work; new tracking applies to new operations
