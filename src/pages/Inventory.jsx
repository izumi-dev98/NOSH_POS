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
  }, []);

  // Filter inventory by search and category
  const filteredInventory = inventory
    .filter(item => {
      const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "all" || item.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
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
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Latest Price</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No inventory found
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item, index) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.item_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.qty}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type}</td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {(() => {
                        const key = item.item_name?.toLowerCase().trim();
                        const latestPrice = latestPrices[key];
                        return latestPrice !== undefined && latestPrice !== null ? formatMMK(latestPrice) : "-";
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">
                        {getCategoryName(item.category_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(canEditInventory || canEditInventoryCategory) && (
                        <div className="flex justify-center gap-2">
                          {(canEditInventory || canEditInventoryCategory) && (
                            <button
                              onClick={() => openEditModal(item)}
                              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                            >
                              {canEditInventory ? "Edit" : "Edit Category"}
                            </button>
                          )}
                          {canDeleteInventory && (
                            <button
                              onClick={() => deleteInventoryItem(item.id)}
                              className="px-3 py-1 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                      {!canEditInventory && !canEditInventoryCategory && <span className="text-slate-400 text-sm">View Only</span>}
                    </td>
                  </tr>
                ))
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
    </div>
  );
}
