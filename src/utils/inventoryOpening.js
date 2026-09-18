export function getMonthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().split("T")[0];
  return { start, end };
}

export function getPreviousMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
}

function sumMonthMovements(movements) {
  return (movements || []).reduce(
    (totals, movement) => {
      totals.purchase_qty += Number(movement.purchase_qty || 0);
      totals.add_stock_qty += Number(movement.add_stock_qty || 0);
      totals.adjust_qty += Number(movement.adjust_qty || 0);
      totals.sale_usage_qty += Number(movement.sale_usage_qty || 0);
      totals.internal_usage_qty += Number(movement.internal_usage_qty || 0);
      return totals;
    },
    { purchase_qty: 0, add_stock_qty: 0, adjust_qty: 0, sale_usage_qty: 0, internal_usage_qty: 0 }
  );
}

export function getPreviousMonthClosingQty(item, openingRecords, movements, month) {
  const { start } = getMonthBounds(month);
  const previousMonth = getPreviousMonth(month);
  const { start: previousStart, end: previousEnd } = getMonthBounds(previousMonth);

  const previousMonthMovements = (movements || [])
    .filter((movement) => (
      movement.inventory_id === item.id
      && movement.movement_date >= previousStart
      && movement.movement_date <= previousEnd
    ))
    .sort((a, b) => a.movement_date.localeCompare(b.movement_date));

  const previousMonthOpening = (openingRecords || [])
    .filter((record) => (
      record.inventory_id === item.id
      && record.opening_date >= previousStart
      && record.opening_date <= previousEnd
    ))
    .sort((a, b) => a.opening_date.localeCompare(b.opening_date))[0];

  if (previousMonthOpening) {
    const totals = sumMonthMovements(previousMonthMovements);
    return Math.max(
      0,
      Number(previousMonthOpening.opening_qty || 0)
        + totals.purchase_qty
        + totals.add_stock_qty
        + totals.adjust_qty
        - totals.sale_usage_qty
        - totals.internal_usage_qty
    );
  }

  const lastDayMovement = previousMonthMovements.at(-1);
  if (lastDayMovement?.closing_qty !== undefined && lastDayMovement?.closing_qty !== null) {
    return Number(lastDayMovement.closing_qty);
  }

  const lastPriorMovement = (movements || [])
    .filter((movement) => movement.inventory_id === item.id && movement.movement_date < start)
    .sort((a, b) => a.movement_date.localeCompare(b.movement_date))
    .at(-1);

  if (lastPriorMovement?.closing_qty !== undefined && lastPriorMovement?.closing_qty !== null) {
    return Number(lastPriorMovement.closing_qty);
  }

  const priorOpening = (openingRecords || [])
    .filter((record) => record.inventory_id === item.id && record.opening_date < start)
    .sort((a, b) => a.opening_date.localeCompare(b.opening_date))
    .at(-1);

  if (priorOpening?.opening_qty !== undefined && priorOpening?.opening_qty !== null) {
    return Number(priorOpening.opening_qty);
  }

  return Number(item.qty || 0);
}

export function getEffectiveMonthOpening(item, openingRecords, movements, month) {
  const { start } = getMonthBounds(month);

  const hasPreviousMonthData = (openingRecords || []).some(
    (record) => record.inventory_id === item.id && record.opening_date < start
  ) || (movements || []).some(
    (movement) => movement.inventory_id === item.id && movement.movement_date < start
  );

  if (hasPreviousMonthData) {
    return {
      opening_date: start,
      opening_qty: getPreviousMonthClosingQty(item, openingRecords, movements, month)
    };
  }

  const thisMonthRecord = (openingRecords || [])
    .filter((record) => record.inventory_id === item.id && record.opening_date.startsWith(`${month}-`))
    .sort((a, b) => a.opening_date.localeCompare(b.opening_date))[0];

  if (thisMonthRecord) {
    return {
      opening_date: thisMonthRecord.opening_date,
      opening_qty: Number(thisMonthRecord.opening_qty || 0)
    };
  }

  return {
    opening_date: start,
    opening_qty: Number(item.qty || 0)
  };
}
