import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { hasFeature } from "../utils/accessControl";

export default function Inventory({
  inventory,
  updateInventoryItem,
  deleteInventoryItem
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [latestPrices, setLatestPrices] = useState({});
  const [creationDateFrom, setCreationDateFrom] = useState("");
  const [creationDateTo, setCreationDateTo] = useState("");

  // Detail Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Opening Inventory states
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingData, setOpeningData] = useState({
    opening_date: "",
    opening_qty: ""
  });
  const [currentOpeningInventory, setCurrentOpeningInventory] = useState(null);
  const [showDailyMovements, setShowDailyMovements] = useState(false);
  const [dailyMovements, setDailyMovements] = useState([]);
  const [selectedInventoryForMovements, setSelectedInventoryForMovements] = useState(null);

  // Get user role
  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";
  const isAdminRole = user?.role === "admin";
  const canEditInventory = isSuperAdmin ? true : !isAdminRole && hasFeature(user, "btn-inventory-edit");
  const canDeleteInventory = isSuperAdmin ? true : !isAdminRole && hasFeature(user, "btn-inventory-delete");
  const canEditInventoryCategory = isSuperAdmin || isAdminRole || hasFeature(user, "btn-inventory-edit-category");

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const [formData, setFormData] = useState({
    item_name: "",
    qty: "",
    type: "",
    category_id: "",
    price: ""
  });

  // Opening inventory dates map
  const [openingDatesMap, setOpeningDatesMap] = useState({});
  const [dailyMovementsMap, setDailyMovementsMap] = useState({});
  const [itemSearchInModal, setItemSearchInModal] = useState("");

  // Get category name by ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return "-";
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.name : "-";
  };

  // Fetch inventory categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
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
        const { data: purchaseItemsData } = await supabase
          .from("purchase_items")
          .select("item_name, unit_price")
          .in("purchase_id", receivedPurchaseIds)
          .order("id", { ascending: false });

        if (purchaseItemsData) {
          const prices = {};
          purchaseItemsData.forEach(item => {
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

  useEffect(() => {
    fetchCategories();
    fetchLatestPrices();
    fetchSuppliers();
    fetchAllOpeningDates();
  }, [inventory]);

  // Fetch all opening inventory dates
  const fetchAllOpeningDates = async () => {
    try {
      const { data: openingData, error: openingError } = await supabase
        .from("opening_inventory")
        .select("inventory_id, opening_date, opening_qty");

      if (openingError) throw openingError;

      const datesMap = {};
      openingData?.forEach((record) => {
        datesMap[record.inventory_id] = record.opening_date;
      });
      setOpeningDatesMap(datesMap);

      const { data: movements, error: movementsError } = await supabase
        .from("daily_inventory_movements")
        .select("*")
        .order("movement_date", { ascending: true });

      if (movementsError) throw movementsError;

      const movementsMap = {};
      movements?.forEach((movement) => {
        const current = movementsMap[movement.inventory_id];
        if (!current || new Date(movement.movement_date) >= new Date(current.movement_date)) {
          movementsMap[movement.inventory_id] = movement;
        }
      });

      setDailyMovementsMap(movementsMap);
    } catch (err) {
      console.error("Error fetching opening dates and movements:", err);
    }
  };

  // Fetch suppliers
  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find(s => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  // Fetch opening inventory data for an item
  const fetchOpeningInventory = async (item) => {
    try {
      const { data, error } = await supabase
        .from("opening_inventory")
        .select("*")
        .eq("inventory_id", item.id)
        .order("opening_date", { ascending: false })
        .limit(1);

      if (error) throw error;
      
      if (data && data.length > 0) {
        setCurrentOpeningInventory(data[0]);
        setOpeningData({
          opening_date: data[0].opening_date,
          opening_qty: data[0].opening_qty.toString()
        });
      } else {
        setCurrentOpeningInventory(null);
        setOpeningData({
          opening_date: new Date().toISOString().split('T')[0],
          opening_qty: item.qty.toString()
        });
      }
    } catch (err) {
      console.error("Error fetching opening inventory:", err);
    }
  };

  // Open opening inventory modal
  const openOpeningModal = async (item) => {
    await fetchOpeningInventory(item);
    setSelectedInventoryForMovements(item);
    setShowOpeningModal(true);
  };

  // Save opening inventory
  const saveOpeningInventory = async (item) => {
    try {
      if (!openingData.opening_date || !openingData.opening_qty) {
        alert("Please fill in all fields");
        return;
      }

      if (currentOpeningInventory) {
        // Update existing
        const { error } = await supabase
          .from("opening_inventory")
          .update({
            opening_qty: parseFloat(openingData.opening_qty),
            updated_at: new Date().toISOString()
          })
          .eq("id", currentOpeningInventory.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("opening_inventory")
          .insert({
            inventory_id: item.id,
            opening_date: openingData.opening_date,
            opening_qty: parseFloat(openingData.opening_qty)
          });

        if (error) throw error;
      }

      // Refresh opening dates and daily movements
      await fetchAllOpeningDates();
      await fetchDailyMovements(item);
      
      alert("Opening inventory saved successfully");
      setShowOpeningModal(false);
    } catch (err) {
      console.error("Error saving opening inventory:", err);
      alert("Error saving opening inventory: " + err.message);
    }
  };

  // Fetch daily movements for an item
  const fetchDailyMovements = async (item) => {
    try {
      const { data, error } = await supabase
        .from("daily_inventory_movements")
        .select("*")
        .eq("inventory_id", item.id)
        .order("movement_date", { ascending: true });

      if (error) throw error;
      
      setDailyMovements(data || []);
      setSelectedInventoryForMovements(item);
      setShowDailyMovements(true);
      
      // Also refresh the main map
      await fetchAllOpeningDates();
    } catch (err) {
      console.error("Error fetching daily movements:", err);
      alert("Error fetching daily movements: " + err.message);
    }
  };

  // Update closing qty for a day
  const updateClosingQty = async (movementId, closingQty) => {
    try {
      const { error } = await supabase
        .from("daily_inventory_movements")
        .update({
          closing_qty: parseFloat(closingQty),
          updated_at: new Date().toISOString()
        })
        .eq("id", movementId);

      if (error) throw error;
      
      // Refresh movements and maps
      if (selectedInventoryForMovements) {
        await fetchDailyMovements(selectedInventoryForMovements);
      }
      
      // Refresh the main data map
      await fetchAllOpeningDates();
    } catch (err) {
      console.error("Error updating closing qty:", err);
      alert("Error updating closing qty: " + err.message);
    }
  };

  // Filter inventory by search, category, and creation date
  const filteredInventory = inventory
    .filter(item => {
      const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "all" || item.category_id === selectedCategory;
      
      // Filter by creation date if specified
      let matchesDate = true;
      if (creationDateFrom || creationDateTo) {
        const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : null;
        if (creationDateFrom && itemDate < creationDateFrom) matchesDate = false;
        if (creationDateTo && itemDate > creationDateTo) matchesDate = false;
      }
      
      return matchesSearch && matchesCategory && matchesDate;
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name));

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const openEditModal = (item) => {
    setFormData({
      item_name: item.item_name,
      qty: item.qty,
      type: item.type,
      category_id: item.category_id || "",
      price: item.price || ""
    });
    setEditId(item.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullPayload = {
      item_name: formData.item_name,
      qty: Number(formData.qty),
      type: formData.type,
      category_id: formData.category_id || null,
      price: formData.price ? Number(formData.price) : null
    };
    const adminCategoryPayload = {
      category_id: formData.category_id || null
    };

    if (isEditing) {
      const payload = canEditInventory ? fullPayload : adminCategoryPayload;
      await updateInventoryItem(editId, payload);
    }

    // Refresh latest prices after adding/updating
    await fetchLatestPrices();

    setShowModal(false);
    setIsEditing(false);
    setEditId(null);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  // View stock history for an item
  const viewPurchaseHistory = async (item) => {
    setSelectedItem(item);

    const normalizeName = (value) => value?.toString().trim().toLowerCase() || "";
    const normalizeType = (value) => {
      const normalized = value?.toString().trim().toLowerCase();
      return normalized || "-";
    };
    const getFifoTimestamp = (value) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const ts = new Date(value).getTime();
      return Number.isNaN(ts) ? Number.POSITIVE_INFINITY : ts;
    };

    const targetName = normalizeName(item.item_name);
    const targetType = normalizeType(item.type);
    const targetId = item.id;

    // Fetch ALL purchases
    const { data: allPurchases } = await supabase
      .from("purchases")
      .select("id, date, created_at, invoice_number, supplier_id, status")
      .order("created_at", { ascending: true });

    const allPurchaseIds = allPurchases?.map(p => p.id) || [];

    // Fetch add_stock records
    const { data: addStockRecords } = await supabase
      .from("internal_consumption")
      .select("id, created_at")
      .eq("status", "add_stock")
      .order("created_at", { ascending: true });

    const addStockIds = addStockRecords?.map(r => r.id) || [];

    const history = [];

    // Add purchase items
    if (allPurchaseIds.length > 0) {
      const { data: purchaseItems } = await supabase
        .from("purchase_items")
        .select("id, qty, foc_qty, unit_price, purchase_id, item_name, type, original_qty, expiry_date")
        .in("purchase_id", allPurchaseIds);

      if (purchaseItems) {
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
            const fifoDate = purchase.created_at || purchase.date;
            const currentQty = parseFloat(pi.qty) || 0;
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

    // Add add_stock items
    if (addStockIds.length > 0) {
      const { data: addStockItems } = await supabase
        .from("internal_consumption_items")
        .select("id, qty, foc_qty, unit_price, consumption_id, inventory_id")
        .in("consumption_id", addStockIds);

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
            item_name: item.item_name,
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

    // Sort by date (oldest first)
    history.sort((a, b) => {
      const tsA = getFifoTimestamp(a.fifo_date);
      const tsB = getFifoTimestamp(b.fifo_date);
      if (tsA !== tsB) return tsA - tsB;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    setPurchaseHistory(history);
    setShowDetailModal(true);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage inventory items</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="search"
            placeholder="Search items..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Creation Date Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm font-medium text-slate-700">Filter by Item Creation Date:</label>
          <input
            type="date"
            value={creationDateFrom}
            onChange={(e) => {
              setCreationDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="From"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={creationDateTo}
            onChange={(e) => {
              setCreationDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="To"
          />
          <button
            onClick={() => {
              setCreationDateFrom("");
              setCreationDateTo("");
              setCurrentPage(1);
            }}
            className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => { setSelectedCategory("all"); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            selectedCategory === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedCategory === cat.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">No</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Latest Price</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Opening Qty</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Purchase</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Add Stock</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Adjust</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Sale Usage</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Internal Usage</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Closing Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Opening Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.length === 0 ? (
                <tr>
                  <td colSpan="14" className="px-4 py-8 text-center text-slate-500">
                    No inventory found
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item, index) => {
                  const movement = dailyMovementsMap[item.id] || {
                    opening_qty: 0,
                    purchase_qty: 0,
                    add_stock_qty: 0,
                    adjust_qty: 0,
                    sale_usage_qty: 0,
                    internal_usage_qty: 0,
                    closing_qty: 0,
                  };

                  return (
                    <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                      <td className="px-4 py-3 text-slate-500 text-xs">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 text-sm">
                        <button
                          type="button"
                          onClick={() => viewPurchaseHistory(item)}
                          className="text-indigo-700 hover:text-indigo-900 underline underline-offset-2 font-semibold text-left"
                          title="View item details"
                        >
                          {item.item_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{item.type}</td>
                      <td className="px-4 py-3 text-center text-slate-600 text-xs">
                        {(() => {
                          const key = item.item_name?.toLowerCase().trim();
                          const latestPrice = latestPrices[key];
                          return latestPrice !== undefined && latestPrice !== null ? formatMMK(latestPrice) : "-";
                        })()}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className="font-medium text-blue-600">{Number(movement.opening_qty || 0)}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className={`font-medium ${Number(movement.purchase_qty || 0) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          {Number(movement.purchase_qty || 0) > 0 ? `+${Number(movement.purchase_qty)}` : "0"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className={`font-medium ${Number(movement.add_stock_qty || 0) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          {Number(movement.add_stock_qty || 0) > 0 ? `+${Number(movement.add_stock_qty)}` : "0"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className={`font-medium ${Number(movement.adjust_qty || 0) !== 0 ? (Number(movement.adjust_qty) > 0 ? "text-blue-600" : "text-orange-600") : "text-slate-400"}`}>
                          {Number(movement.adjust_qty || 0) !== 0 ? `${Number(movement.adjust_qty) > 0 ? "+" : ""}${Number(movement.adjust_qty)}` : "0"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className={`font-medium ${Number(movement.sale_usage_qty || 0) > 0 ? "text-red-600" : "text-slate-400"}`}>
                          {Number(movement.sale_usage_qty || 0) > 0 ? `-${Number(movement.sale_usage_qty)}` : "0"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className={`font-medium ${Number(movement.internal_usage_qty || 0) > 0 ? "text-red-600" : "text-slate-400"}`}>
                          {Number(movement.internal_usage_qty || 0) > 0 ? `-${Number(movement.internal_usage_qty)}` : "0"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-xs">
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded font-semibold">{Number(movement.closing_qty || 0)}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-xs">
                        {openingDatesMap[item.id] ? (
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">{openingDatesMap[item.id]}</span>
                        ) : (
                          <span className="text-slate-400">Not Set</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">
                          {getCategoryName(item.category_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1 flex-wrap">
                          {(canEditInventory || canEditInventoryCategory) && (
                            <button
                              onClick={() => openEditModal(item)}
                              className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                            >
                              Edit
                            </button>
                          )}
                          {canDeleteInventory && (
                            <button
                              onClick={() => deleteInventoryItem(item.id)}
                              className="px-2 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4 pb-4">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                currentPage === 1
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                currentPage === totalPages
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {canEditInventory ? "Edit Item" : "Edit Category"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {canEditInventory && (
                <>
                  <input
                    name="item_name"
                    placeholder="Item name"
                    value={formData.item_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    type="number"
                    name="qty"
                    placeholder="Quantity"
                    value={formData.qty}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    name="type"
                    placeholder="Unit"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <input
                    type="number"
                    name="price"
                    placeholder="Price"
                    value={formData.price}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    step="0.01"
                    min="0"
                  />
                </>
              )}

              <select
                name="category_id"
                value={formData.category_id}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Detail Modal - Purchase History */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Item Details</h3>
                <p className="text-sm text-slate-500">{selectedItem?.item_name}</p>
                {selectedItem && (
                  <div className="mt-2 flex gap-6 text-sm">
                    <div>
                      <span className="text-slate-500">Current Stock:</span>
                      <span className="ml-2 font-semibold text-slate-800">{selectedItem.qty} {selectedItem.type}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Category:</span>
                      <span className="ml-2 font-semibold text-slate-800">{getCategoryName(selectedItem.category_id)}</span>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
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
                      const rowTotal = (billableQty * (parseFloat(item.unit_price) || 0));
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

      {/* Opening Inventory Modal */}
      {showOpeningModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Monthly Opening</h3>
            
            {!selectedInventoryForMovements ? (
              <>
                <p className="text-sm text-slate-600 mb-3">Search and select an item:</p>
                
                <input
                  type="search"
                  placeholder="Search item name..."
                  value={itemSearchInModal}
                  onChange={(e) => setItemSearchInModal(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
                />

                <div className="space-y-2 max-h-96 overflow-y-auto mb-4 flex-1">
                  {inventory
                    .filter(item => item.item_name.toLowerCase().includes(itemSearchInModal.toLowerCase()))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedInventoryForMovements(item);
                          fetchOpeningInventory(item);
                          setItemSearchInModal("");
                        }}
                        className="w-full text-left px-4 py-3 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition"
                      >
                        <div className="font-medium text-slate-800">{item.item_name}</div>
                        <div className="text-xs text-slate-500">Unit: {item.type} | Current Qty: {item.qty}</div>
                        {openingDatesMap[item.id] && (
                          <div className="text-xs text-emerald-600 font-medium">Opening Date: {openingDatesMap[item.id]}</div>
                        )}
                      </button>
                    ))}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOpeningModal(false);
                      setSelectedInventoryForMovements(null);
                      setItemSearchInModal("");
                      setOpeningData({ opening_date: "", opening_qty: "" });
                      setCurrentOpeningInventory(null);
                    }}
                    className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600 mb-4">{selectedInventoryForMovements.item_name}</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Opening Month (Read Only)</label>
                    <input
                      type="date"
                      value={openingData.opening_date}
                      onChange={(e) => setOpeningData({ ...openingData, opening_date: e.target.value })}
                      disabled={currentOpeningInventory !== null}
                      className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none ${
                        currentOpeningInventory ? "bg-slate-100 cursor-not-allowed" : "focus:ring-2 focus:ring-indigo-500"
                      }`}
                    />
                    {currentOpeningInventory && (
                      <p className="text-xs text-slate-500 mt-1">Opening month cannot be changed once set</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Opening Quantity</label>
                    <input
                      type="number"
                      value={openingData.opening_qty}
                      onChange={(e) => setOpeningData({ ...openingData, opening_qty: e.target.value })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInventoryForMovements(null);
                        setItemSearchInModal("");
                      }}
                      className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => saveOpeningInventory(selectedInventoryForMovements)}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                    >
                      Save & View Movements
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Daily Movements Modal */}
      {showDailyMovements && selectedInventoryForMovements && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-6xl shadow-xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Daily Inventory Movements</h3>
                <p className="text-sm text-slate-500">{selectedInventoryForMovements.item_name}</p>
                {currentOpeningInventory && (
                  <p className="text-sm text-emerald-600 font-medium mt-2">
                    Opening Date: {currentOpeningInventory.opening_date} | Opening Qty: {currentOpeningInventory.opening_qty}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowDailyMovements(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Opening Qty</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Purchase</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Add Stock</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Adjust</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Sale Usage</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Internal Usage</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Closing Qty</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyMovements.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-4 py-8 text-center text-slate-500">No movements recorded yet</td>
                    </tr>
                  ) : (
                    dailyMovements.map((movement) => (
                      <tr key={movement.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{movement.movement_date}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{movement.opening_qty}</td>
                        <td className="px-4 py-3 text-center">
                          {movement.purchase_qty > 0 ? (
                            <span className="text-emerald-600 font-medium">+{movement.purchase_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {movement.add_stock_qty > 0 ? (
                            <span className="text-emerald-600 font-medium">+{movement.add_stock_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {movement.adjust_qty !== 0 ? (
                            <span className={movement.adjust_qty > 0 ? "text-blue-600 font-medium" : "text-orange-600 font-medium"}>
                              {movement.adjust_qty > 0 ? "+" : ""}{movement.adjust_qty}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {movement.sale_usage_qty > 0 ? (
                            <span className="text-red-600 font-medium">-{movement.sale_usage_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {movement.internal_usage_qty > 0 ? (
                            <span className="text-red-600 font-medium">-{movement.internal_usage_qty}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-800">
                          <input
                            type="number"
                            value={movement.closing_qty}
                            onChange={(e) => updateClosingQty(movement.id, e.target.value)}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-slate-500">Editable</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button 
                onClick={() => setShowDailyMovements(false)} 
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
