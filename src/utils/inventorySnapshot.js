import supabase from "../createClients";

/**
 * Generate a snapshot for a specific date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 */
export async function generateSnapshot(dateStr) {
  const { data, error } = await supabase.rpc('generate_inventory_snapshot', {
    target_date: dateStr
  });

  if (error) {
    console.error('Error generating snapshot:', error);
    throw error;
  }

  return data;
}

/**
 * Get snapshot for a specific date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of snapshot records
 */
export async function getSnapshot(dateStr) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .eq('snapshot_date', dateStr)
    .order('item_name', { ascending: true });

  if (error) {
    console.error('Error fetching snapshot:', error);
    return [];
  }

  return data || [];
}

/**
 * Get quantity comparison between two dates
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of items with quantity changes
 */
export async function compareDates(startDate, endDate) {
  const { data, error } = await supabase
    .rpc('get_inventory_change', {
      start_date: startDate,
      end_date: endDate
    });

  if (error) {
    console.error('Error comparing dates:', error);
    return [];
  }

  return data || [];
}

/**
 * Get snapshots for a date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of snapshot records
 */
export async function getSnapshotsInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .gte('snapshot_date', startDate)
    .lte('snapshot_date', endDate)
    .order('snapshot_date', { ascending: false })
    .order('item_name', { ascending: true });

  if (error) {
    console.error('Error fetching snapshots:', error);
    return [];
  }

  return data || [];
}

/**
 * Generate snapshot for today if not exists
 */
export async function ensureTodaySnapshot() {
  const today = new Date().toISOString().split('T')[0];
  const existing = await getSnapshot(today);

  if (existing.length === 0) {
    await generateSnapshot(today);
  }

  return getSnapshot(today);
}

/**
 * Get the most recent snapshot before or on a given date
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of snapshot records
 */
export async function getLatestSnapshotOnOrBefore(dateStr) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .lte('snapshot_date', dateStr)
    .order('snapshot_date', { ascending: false })
    .limit(1000); // Get all items from the most recent date

  if (error) {
    console.error('Error fetching latest snapshot:', error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Get the most recent date from results
  const latestDate = data[0].snapshot_date;

  // Filter to only include items from that date
  return data.filter(item => item.snapshot_date === latestDate);
}

/**
 * Build a map of inventory_id -> snapshot record for quick lookup
 * @param {Array} snapshots - Array of snapshot records
 * @returns {Map} Map of inventory_id to snapshot record
 */
export function buildSnapshotMap(snapshots) {
  const map = new Map();
  snapshots.forEach(item => {
    map.set(item.inventory_id, item);
  });
  return map;
}
