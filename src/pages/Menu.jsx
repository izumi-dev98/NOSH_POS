import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Menu({ inventory }) {
  const [activeTab, setActiveTab] = useState("menu");
  const [statusFilter, setStatusFilter] = useState("active");
  const [menu, setMenu] = useState([]);
  const [menuSets, setMenuSets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const [formData, setFormData] = useState({
    menu_name: "",
    price: "",
    category_id: "",
    status: "active",
    ingredients: [{ inventory_id: "", qty: 1 }],
  });

  const [menuSetFormData, setMenuSetFormData] = useState({
    set_name: "",
    price: "",
    category_id: "",
    menu_items: [],
  });

  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const mmkFormatter = new Intl.NumberFormat("en-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 });

  // Load menu and ingredients
  const fetchMenu = async () => {
    try {
      const { data: menuData, error: menuErr } = await supabase.from("menu").select("*");
      if (menuErr) throw menuErr;

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("*");
      if (ingErr) throw ingErr;

      const merged = menuData.map((m) => ({
        ...m,
        status: m.status ?? "active",
        ingredients: ingData.filter((i) => i.menu_id === m.id),
      }));

      setMenu(merged);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu", "error");
      setMenu([]);
    }
  };

  // Load menu sets
  const fetchMenuSets = async () => {
    try {
      const { data: setsData, error: setsErr } = await supabase.from("menu_sets").select("*");
      if (setsErr) throw setsErr;

      const { data: itemsData, error: itemsErr } = await supabase.from("menu_set_items").select("*");
      if (itemsErr) throw itemsErr;

      const merged = setsData.map((s) => ({
        ...s,
        menu_items: itemsData.filter((i) => i.set_id === s.id),
      }));

      setMenuSets(merged);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu sets", "error");
      setMenuSets([]);
    }
  };

  // Load categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("categories").select("*").order("name", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
      setCategories([]);
    }
  };

  useEffect(() => { fetchMenu(); fetchMenuSets(); fetchCategories(); }, []);

  const openAddModal = () => {
    if (activeTab === "menu") {
      setFormData({ menu_name: "", price: "", category_id: "", status: "active", ingredients: [{ inventory_id: "", qty: 1 }] });
    } else {
      setMenuSetFormData({ set_name: "", price: "", category_id: "", menu_items: [] });
    }
    setIsEditing(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    if (activeTab === "menu") {
      setFormData({
        menu_name: item.menu_name || "",
        price: item.price || "",
        category_id: item.category_id || "",
        status: item.status || "active",
        ingredients: item.ingredients.length ? item.ingredients : [{ inventory_id: "", qty: 1 }],
      });
    } else {
      setMenuSetFormData({
        set_name: item.set_name || "",
        price: item.price || "",
        category_id: item.category_id || "",
        menu_items: item.menu_items.length ? item.menu_items.map(mi => mi.menu_id) : [],
      });
    }
    setEditItem(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSetFormChange = (e) => setMenuSetFormData({ ...menuSetFormData, [e.target.name]: e.target.value });

  const handleMenuItemToggle = (menuId) => {
    const currentItems = menuSetFormData.menu_items;
    if (currentItems.includes(menuId)) {
      setMenuSetFormData({ ...menuSetFormData, menu_items: currentItems.filter(id => id !== menuId) });
    } else {
      setMenuSetFormData({ ...menuSetFormData, menu_items: [...currentItems, menuId] });
    }
  };

  const handleIngredientChange = (i, e) => {
    const newIngredients = [...formData.ingredients];

    newIngredients[i][e.target.name] =
      e.target.name === "qty"
        ? e.target.value === ""
          ? ""
          : parseFloat(e.target.value)
        : e.target.value;

    setFormData({ ...formData, ingredients: newIngredients });
  };


  const addIngredientRow = () => setFormData({
    ...formData,
    ingredients: [...formData.ingredients, { inventory_id: "", qty: 1 }],
  });

  const removeIngredientRow = (i) => setFormData({
    ...formData,
    ingredients: formData.ingredients.filter((_, idx) => idx !== i),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (activeTab === "menu") {
      const validIngredients = formData.ingredients
        .map((ing) => ({
          inventory_id: Number(ing.inventory_id),
          qty: Number(ing.qty),
        }))
        .filter((ing) => Number.isFinite(ing.inventory_id) && ing.inventory_id > 0 && Number.isFinite(ing.qty) && ing.qty > 0);

      try {
        if (isEditing && editItem) {
          const { error: updateErr } = await supabase
            .from("menu")
            .update({
              menu_name: formData.menu_name,
              price: Number(formData.price),
              category_id: formData.category_id ? Number(formData.category_id) : null,
              status: formData.status
            })
            .eq("id", editItem.id);
          if (updateErr) throw updateErr;

          await supabase.from("menu_ingredients").delete().eq("menu_id", editItem.id);

          const ingredientsToInsert = validIngredients.map((ing) => ({
            menu_id: editItem.id,
            inventory_id: ing.inventory_id,
            qty: ing.qty,
          }));
          if (ingredientsToInsert.length) {
            await supabase.from("menu_ingredients").insert(ingredientsToInsert);
          }
        } else {
          const { data: newMenu, error: insertErr } = await supabase
            .from("menu")
            .insert([{
              menu_name: formData.menu_name,
              price: Number(formData.price),
              category_id: formData.category_id ? Number(formData.category_id) : null,
              status: formData.status
            }])
            .select()
            .single();
          if (insertErr) throw insertErr;

          const ingredientsToInsert = validIngredients.map((ing) => ({
            menu_id: newMenu.id,
            inventory_id: ing.inventory_id,
            qty: ing.qty,
          }));
          if (ingredientsToInsert.length) {
            await supabase.from("menu_ingredients").insert(ingredientsToInsert);
          }
        }

        Swal.fire("Success", "Menu saved!", "success");
        setShowModal(false);
        fetchMenu();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to save menu", "error");
      }
    } else {
      // Menu Set
      const validMenuItemIds = menuSetFormData.menu_items
        .map((menuId) => Number(menuId))
        .filter((menuId) => Number.isFinite(menuId) && menuId > 0);

      try {
        if (isEditing && editItem) {
          const { error: updateErr } = await supabase
            .from("menu_sets")
            .update({
              set_name: menuSetFormData.set_name,
              price: Number(menuSetFormData.price),
              category_id: menuSetFormData.category_id ? Number(menuSetFormData.category_id) : null
            })
            .eq("id", editItem.id);
          if (updateErr) throw updateErr;

          await supabase.from("menu_set_items").delete().eq("set_id", editItem.id);

          const itemsToInsert = validMenuItemIds.map((menuId) => ({
            set_id: editItem.id,
            menu_id: menuId,
          }));
          if (itemsToInsert.length) {
            await supabase.from("menu_set_items").insert(itemsToInsert);
          }
        } else {
          const { data: newSet, error: insertErr } = await supabase
            .from("menu_sets")
            .insert([{
              set_name: menuSetFormData.set_name,
              price: Number(menuSetFormData.price),
              category_id: menuSetFormData.category_id ? Number(menuSetFormData.category_id) : null
            }])
            .select()
            .single();
          if (insertErr) throw insertErr;

          const itemsToInsert = validMenuItemIds.map((menuId) => ({
            set_id: newSet.id,
            menu_id: menuId,
          }));
          if (itemsToInsert.length) {
            await supabase.from("menu_set_items").insert(itemsToInsert);
          }
        }

        Swal.fire("Success", "Menu set saved!", "success");
        setShowModal(false);
        fetchMenuSets();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to save menu set", "error");
      }
    }
  };

  const handleDelete = async (id) => {
    const res = await Swal.fire({
      title: activeTab === "menu" ? "Delete this menu?" : "Delete this menu set?",
      icon: "warning",
      showCancelButton: true,
    });
    if (res.isConfirmed) {
      try {
        if (activeTab === "menu") {
          await supabase.from("menu_ingredients").delete().eq("menu_id", id);
          await supabase.from("menu").delete().eq("id", id);
          Swal.fire("Deleted!", "", "success");
          fetchMenu();
        } else {
          await supabase.from("menu_set_items").delete().eq("set_id", id);
          await supabase.from("menu_sets").delete().eq("id", id);
          Swal.fire("Deleted!", "", "success");
          fetchMenuSets();
        }
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const currentData = activeTab === "menu" ? menu : menuSets;
  const filteredData = currentData.filter((item) => {
    const name = activeTab === "menu" ? (item.menu_name || "") : (item.set_name || "");
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category_id === Number(selectedCategory);
    const matchesStatus = activeTab === "set" || statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-900 glass:bg-transparent min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Menu Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">Manage menu items and sets</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {activeTab === "menu" ? "+ Add Menu" : "+ Add Menu Set"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab("menu"); setSearchTerm(""); setSelectedCategory("all"); setStatusFilter("active"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "menu"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 glass:bg-white/30 glass:text-slate-800 glass:border-white/40 glass:backdrop-blur-xl glass:hover:bg-white/40"
          }`}
        >
          Menu Items
        </button>
        <button
          onClick={() => { setActiveTab("set"); setSearchTerm(""); setSelectedCategory("all"); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "set"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 glass:bg-white/30 glass:text-slate-800 glass:border-white/40 glass:backdrop-blur-xl glass:hover:bg-white/40"
          }`}
        >
          Menu Sets
        </button>
      </div>

      {/* Status Filter (Menu Items only) */}
      {activeTab === "menu" && (
        <div className="flex gap-2 mb-4">
          {["active", "inactive", "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                statusFilter === s
                  ? s === "active"
                    ? "bg-green-600 text-white"
                    : s === "inactive"
                      ? "bg-red-600 text-white"
                      : "bg-slate-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {s === "active" ? "Active" : s === "inactive" ? "Inactive" : "All"}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700 glass:bg-white/28 glass:border-white/45 glass:backdrop-blur-2xl p-4 mb-6">
        <input
          type="text"
          placeholder={activeTab === "menu" ? "Search menu..." : "Search menu sets..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
        />
      </div>

      {/* Category Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedCategory === "all"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 glass:bg-white/30 glass:text-slate-800 glass:border-white/40 glass:backdrop-blur-xl glass:hover:bg-white/40"
            }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id.toString())}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedCategory === cat.id.toString()
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 glass:bg-white/30 glass:text-slate-800 glass:border-white/40 glass:backdrop-blur-xl glass:hover:bg-white/40"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.map((item) => (
          <div
            key={item.id}
            className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 glass:bg-white/28 glass:border-white/45 glass:backdrop-blur-2xl shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="absolute right-3 top-3 z-10 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-md">
              {mmkFormatter.format(item.price)}
            </div>

            <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500" />

            <div className="p-5">
              <div className="mb-3 pr-24">
                <h3 className="text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">
                  {activeTab === "menu" ? item.menu_name : item.set_name}
                </h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  {activeTab === "menu" ? "Menu" : "Menu Set"}
                </p>
                {activeTab === "menu" && (
                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${
                    item.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {item.status === "active" ? "Active" : "Inactive"}
                  </span>
                )}
              </div>

              <div className="mb-4 flex min-h-7 items-center">
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200 glass:bg-white/30 glass:text-indigo-900 glass:border glass:border-white/45">
                  {categories.find(c => c.id === item.category_id)?.name || "Uncategorized"}
                </span>
              </div>

              <div className="mb-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                {activeTab === "menu" ? (
                  item.ingredients.map((ing, idx) => {
                    const inv = safeInventory.find((i) => i.id === Number(ing.inventory_id));
                    return (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700 glass:bg-white/25 glass:border glass:border-white/35 px-3 py-2">
                        <span className="truncate">{inv?.item_name || "Unknown"}</span>
                        <span className="ml-3 rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-600 dark:text-slate-100 glass:bg-white/30 glass:text-slate-800">
                          x {ing.qty}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  item.menu_items.map((mi, idx) => {
                    const menuItem = menu.find((m) => m.id === Number(mi.menu_id));
                    return (
                      <div key={idx} className="rounded-lg bg-slate-50 dark:bg-slate-700 glass:bg-white/25 glass:border glass:border-white/35 px-3 py-2">
                        {menuItem?.menu_name || "Unknown"}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end gap-2">
              {activeTab === "menu" && (
                <button
                  onClick={async () => {
                    const newStatus = item.status === "active" ? "inactive" : "active";
                    const { error } = await supabase
                      .from("menu")
                      .update({ status: newStatus })
                      .eq("id", item.id);
                    if (error) {
                      Swal.fire("Error", error.message, "error");
                    } else {
                      fetchMenu();
                    }
                  }}
                  className={`px-3 py-1.5 text-white text-sm rounded-lg transition-colors ${
                    item.status === "active"
                      ? "bg-red-500 hover:bg-red-600"
                      : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  {item.status === "active" ? "Deactivate" : "Activate"}
                </button>
              )}
              <button
                onClick={() => openEditModal(item)}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="px-3 py-1.5 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 transition-colors"
              >
                Delete
              </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white dark:bg-slate-800 glass:bg-white/28 glass:border glass:border-white/50 glass:backdrop-blur-2xl rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg text-slate-800 dark:text-slate-100">
            <h3 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-100">
              {activeTab === "menu"
                ? (isEditing ? "Edit Menu" : "Add Menu")
                : (isEditing ? "Edit Menu Set" : "Add Menu Set")
              }
            </h3>

            {activeTab === "menu" ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  name="menu_name"
                  placeholder="Menu Name"
                  value={formData.menu_name}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                  required
                />
                <input
                  name="price"
                  type="number"
                  placeholder="Price"
                  value={formData.price}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                  required
                />
                <select
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                >
                  <option value="">Select Category (Optional)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Status</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: "active" })}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                        formData.status === "active"
                          ? "bg-green-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, status: "inactive" })}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
                        formData.status === "inactive"
                          ? "bg-red-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Inactive
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">Ingredients</p>
                {formData.ingredients.map((ing, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select
                      name="inventory_id"
                      value={ing.inventory_id}
                      onChange={(e) => handleIngredientChange(i, e)}
                      className="flex-1 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                    >
                      <option value="">Select item</option>
                      {safeInventory.map((inv) => (
                        <option key={inv.id} value={inv.id}>{inv.item_name}</option>
                      ))}
                    </select>
                    <input
                      name="qty"
                      type="number"
                      step="0.1"
                      min="0"
                      value={ing.qty}
                      onChange={(e) => handleIngredientChange(i, e)}
                      className="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                      required
                    />

                    {formData.ingredients.length > 1 && (
                      <button type="button" onClick={() => removeIngredientRow(i)} className="text-red-500 font-bold">✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addIngredientRow} className="text-blue-600 dark:text-blue-300 text-sm hover:underline">+ Add Ingredient</button>

                <div className="flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-300 dark:bg-slate-600 dark:text-slate-100 rounded-2xl hover:bg-gray-400 dark:hover:bg-slate-500 transition">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition">{isEditing ? "Update" : "Save"}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  name="set_name"
                  placeholder="Menu Set Name"
                  value={menuSetFormData.set_name}
                  onChange={handleSetFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                  required
                />
                <input
                  name="price"
                  type="number"
                  placeholder="Price"
                  value={menuSetFormData.price}
                  onChange={handleSetFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                  required
                />
                <select
                  name="category_id"
                  value={menuSetFormData.category_id}
                  onChange={handleSetFormChange}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-700 dark:text-slate-100 glass:bg-white/30 glass:border-white/40 glass:backdrop-blur-xl"
                >
                  <option value="">Select Category (Optional)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <div>
                  <p className="font-semibold mb-2 text-slate-800 dark:text-slate-100">Select Menu Items</p>
                  <div className="max-h-60 overflow-y-auto border border-slate-300 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-white dark:bg-slate-800 glass:bg-white/24 glass:border-white/40 glass:backdrop-blur-xl">
                    {menu.map((menuItem) => (
                      <label key={menuItem.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 glass:hover:bg-white/35 p-2 rounded">
                        <input
                          type="checkbox"
                          checked={menuSetFormData.menu_items.includes(menuItem.id)}
                          onChange={() => handleMenuItemToggle(menuItem.id)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{menuItem.menu_name} - {mmkFormatter.format(menuItem.price)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-300 dark:bg-slate-600 dark:text-slate-100 rounded-2xl hover:bg-gray-400 dark:hover:bg-slate-500 transition">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition">{isEditing ? "Update" : "Save"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
