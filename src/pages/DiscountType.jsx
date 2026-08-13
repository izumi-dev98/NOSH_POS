import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function DiscountType() {
  const [discountTypes, setDiscountTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", discount_type: "percent", discount_percent: 0, discount_amount: 0, description: "" });

  const fetchDiscountTypes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("discount_types")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setDiscountTypes(data || []);
    } catch (err) {
      console.error("Error fetching discount types:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDiscountTypes();
  }, []);

  const openAddModal = () => {
    setFormData({ name: "", discount_type: "percent", discount_percent: 0, discount_amount: 0, description: "" });
    setIsEditing(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      name: item.name,
      discount_type: item.discount_amount > 0 ? "amount" : "percent",
      discount_percent: item.discount_amount > 0 ? 0 : item.discount_percent,
      discount_amount: item.discount_amount || 0,
      description: item.description || "",
    });
    setIsEditing(item.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setIsEditing(null);
    setFormData({ name: "", discount_type: "percent", discount_percent: 0, discount_amount: 0, description: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      discount_percent: formData.discount_type === "percent" ? Number(formData.discount_percent) : 0,
      discount_amount: formData.discount_type === "amount" ? Number(formData.discount_amount) : 0,
      description: formData.description,
    };

    try {
      if (isEditing) {
        const { error } = await supabase
          .from("discount_types")
          .update(payload)
          .eq("id", isEditing);
        if (error) throw error;
        Swal.fire("Success", "Discount type updated!", "success");
      } else {
        const { error } = await supabase
          .from("discount_types")
          .insert([payload]);
        if (error) throw error;
        Swal.fire("Success", "Discount type added!", "success");
      }
      closeModal();
      fetchDiscountTypes();
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Delete this discount type?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      try {
        const { error } = await supabase.from("discount_types").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Discount type deleted.", "success");
        fetchDiscountTypes();
      } catch (err) {
        Swal.fire("Error", err.message, "error");
      }
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Discount Type Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage discount types</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + Add Discount Type
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Discount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Description</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : discountTypes.length === 0 ? (
              <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No Data Found</td></tr>
            ) : (
              discountTypes.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <td className="px-4 py-3 text-slate-500">#{item.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.discount_amount > 0
                      ? `${item.discount_amount}`
                      : `${item.discount_percent}%`}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.description || "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEditModal(item)} className="text-indigo-600 hover:text-indigo-800 font-medium mr-3">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="text-rose-600 hover:text-rose-800 font-medium">Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl"
            >
              ✕
            </button>
            <h2 className="text-xl font-bold text-slate-800 mb-5">
              {isEditing ? "Edit Discount Type" : "Add Discount Type"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., Staff Discount"
                  required
                />
              </div>
                  <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount Type</label>
                <div className="flex flex-wrap gap-3 mb-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="discount_type"
                      value="percent"
                      checked={formData.discount_type === "percent"}
                      onChange={() => setFormData({ ...formData, discount_type: "percent", discount_amount: 0 })}
                      className="h-4 w-4 text-indigo-600"
                    />
                    Percent
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="discount_type"
                      value="amount"
                      checked={formData.discount_type === "amount"}
                      onChange={() => setFormData({ ...formData, discount_type: "amount", discount_percent: 0 })}
                      className="h-4 w-4 text-indigo-600"
                    />
                    Fixed Price
                  </label>
                </div>
                {formData.discount_type === "percent" ? (
                  <>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount (%)</label>
                    <input
                      type="number"
                      value={formData.discount_percent}
                      onChange={(e) => setFormData({ ...formData, discount_percent: e.target.value })}
                      className="w-full border border-slate-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="0"
                      max="100"
                      required
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount (Price)</label>
                    <input
                      type="number"
                      value={formData.discount_amount}
                      onChange={(e) => setFormData({ ...formData, discount_amount: e.target.value })}
                      className="w-full border border-slate-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      min="0"
                      required
                    />
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-slate-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  {isEditing ? "Update" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-slate-300 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}