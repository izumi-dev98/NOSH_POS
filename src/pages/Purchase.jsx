import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Purchase({ setInventory }) {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [dateFilter, setDateFilter] = useState("all");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [currentValues, setCurrentValues] = useState({});
  

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    supplier_id: "",
    status: "pending",
    notes: "",
    discount: 0,
    tax: 0,
    payment_type: "Cash Down",
    credit_option: "",
    manual_credit: ""
  });
  const [lineItems, setLineItems] = useState([
    { id: 1, item_name: "", qty: "", buying_price : "", unit_price: "", total_price: "", type: "", inventory_id: "", foc_qty: "", expiry_date: "" }
  ]);
  const [nextItemId, setNextItemId] = useState(2);
  const [inventory, setInventoryLocal] = useState([]);

  const user = JSON.parse(localStorage.getItem("user"));
  const canManage = user?.role === "superadmin" || user?.role === "admin";

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [purchasesRes, suppliersRes, inventoryRes] = await Promise.all([
        supabase.from("purchases").select("*").order("id", { ascending: false }),
        supabase.from("suppliers").select("*").order("name", { ascending: true }),
        supabase.from("inventory").select("*").order("item_name", { ascending: true })
      ]);

      if (purchasesRes.error) {
        console.error("Purchases fetch error:", purchasesRes.error);
        setError("Failed to load purchases: " + purchasesRes.error.message);
      } else {
        const purchasesData = purchasesRes.data || [];
        setPurchases(purchasesData);

        // Calculate current value for each purchase ((qty - foc_qty) * unit_price)
        const values = {};
        for (const purchase of purchasesData) {
          const { data: items } = await supabase
            .from("purchase_items")
            .select("qty, foc_qty, unit_price")
            .eq("purchase_id", purchase.id);

          values[purchase.id] = (items || []).reduce((sum, item) => {
            const qty = parseFloat(item.qty) || 0;
            const focQty = parseFloat(item.foc_qty) || 0;
            const billableQty = qty - focQty;
            return sum + (billableQty * (parseFloat(item.unit_price) || 0));
          }, 0);
        }
        setCurrentValues(values);
      }

      if (!inventoryRes.error) {
        const invData = inventoryRes.data || [];
        setInventoryLocal(invData);
        if (setInventory) setInventory(invData);
      }

      if (suppliersRes.error) {
        console.error("Suppliers fetch error:", suppliersRes.error);
      } else {
        setSuppliers(suppliersRes.data || []);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateInvoiceNumber = () => {
    // Get the highest POS number from existing purchases
    const posNumbers = purchases
      .filter(p => p.invoice_number && p.invoice_number.startsWith("POS-"))
      .map(p => parseInt(p.invoice_number.replace("POS-", ""), 10))
      .filter(n => !isNaN(n));

    const nextNum = posNumbers.length > 0 ? Math.max(...posNumbers) + 1 : 1;
    return `POS-${nextNum}`;
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const sup = suppliers.find((s) => s.id === supplierId);
    return sup ? sup.name : "-";
  };

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch = p.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (getSupplierName(p.supplier_id) || "").toLowerCase().includes(searchTerm.toLowerCase());

    // Date filter
    let matchesDate = true;
    if (dateFilter !== "all" && p.date) {
      const purchaseDate = new Date(p.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === "day") {
        const dayStart = new Date(today);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(today);
        dayEnd.setHours(23, 59, 59, 999);
        matchesDate = purchaseDate >= dayStart && purchaseDate <= dayEnd;
      } else if (dateFilter === "week") {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);
        matchesDate = purchaseDate >= weekStart;
      } else if (dateFilter === "month") {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        matchesDate = purchaseDate >= monthStart;
      } else if (dateFilter === "year") {
        const yearStart = new Date(today.getFullYear(), 0, 1);
        matchesDate = purchaseDate >= yearStart;
      } else if (dateFilter === "custom" && customDateRange.start && customDateRange.end) {
        const start = new Date(customDateRange.start);
        const end = new Date(customDateRange.end);
        end.setHours(23, 59, 59, 999);
        matchesDate = purchaseDate >= start && purchaseDate <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  const totalPages = Math.ceil(filteredPurchases.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPurchases = filteredPurchases.slice(startIndex, startIndex + itemsPerPage);

  const addLineItem = () => {
    setLineItems([...lineItems, { id: nextItemId, item_name: "", qty: "", unit_price: "", total_price: "", type: "", inventory_id: "", foc_qty: "", expiry_date: "" }]);
    setNextItemId(nextItemId + 1);
  };

  const removeLineItem = (id) => {
    if (lineItems.length === 1) {
      return Swal.fire("Warning", "At least one item is required", "warning");
    }
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id, field, value) => {
    setLineItems(lineItems.map((item) => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };

        // Auto-fill from inventory when inventory_id changes
        if (field === "inventory_id" && value) {
          const invItem = inventory.find(i => i.id === parseInt(value));
          if (invItem) {
            updated.item_name = invItem.item_name;
            updated.type = invItem.type || "";
            updated.unit_price = invItem.price || "";
            updated.total_price = calculateLineTotal(updated.qty, updated.foc_qty, invItem.price);
          }
        }

       if (field === "qty" || field === "buying_price") {

    const qty =
        field === "qty"
            ? parseFloat(value) || 0
            : parseFloat(item.qty) || 0;

    const buyingPrice =
        field === "buying_price"
            ? parseFloat(value) || 0
            : parseFloat(item.buying_price) || 0;

    updated.unit_price =
        qty > 0
            ? (buyingPrice / qty).toFixed(0)
            : "";

    updated.total_price = buyingPrice;
}
        // If item_name changes, clear inventory_id (manual entry)
        if (field === "item_name") {
          updated.inventory_id = "";
        }

        return updated;
      }
      return item;
    }));
  };

  const calculateLineTotal = (qty, focQty, price) => {
    const numericQty = parseFloat(qty) || 0;
    const numericFocQty = parseFloat(focQty) || 0;
    const numericPrice = parseFloat(price) || 0;
    const billableQty = numericQty - numericFocQty;
    return ( numericPrice).toFixed(2);
  };




  const calculateSubTotal = () => {
    return lineItems.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
  };

  const calculateDiscountAmount = () => {
    const discountPercent = parseFloat(formData.discount) || 0;
    return (calculateSubTotal() * discountPercent / 100);
  };

  const calculateTaxAmount = () => {
    const taxPercent = parseFloat(formData.tax) || 0;
    const subtotal = calculateSubTotal() - calculateDiscountAmount();
    return (subtotal * taxPercent / 100);
  };

  const calculateGrandTotal = () => {
    const subtotal = calculateSubTotal();
    const discount = calculateDiscountAmount();
    const tax = calculateTaxAmount();
    return (subtotal - discount + tax).toFixed(2);
  };

  const viewDetails = async (purchase) => {
    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id).order("id", { ascending: true });
    setSelectedPurchase(purchase);
    setSelectedPurchaseItems(items || []);
    setShowDetailModal(true);
  };

  const openAddModal = () => {
    setFormData({ date: new Date().toISOString().split("T")[0], supplier_id: "", status: "pending", notes: "", discount: 0, tax: 0, payment_type: "Cash Down", credit_option: "", manual_credit: "" });
    setLineItems([{ id: 1, item_name: "", qty: "", unit_price: "", total_price: "", type: "", inventory_id: "", foc_qty: "", expiry_date: "" }]);
    setNextItemId(2);
    setIsEditing(false);
    setEditId(null);
    setShowModal(true);
  };

  const openEditModal = async (purchase) => {
    const purchaseStatus = purchase.status || "pending";
    if (purchaseStatus === "received") {
      return Swal.fire("Info", "Cannot edit completed purchase", "info");
    }

    const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);

    const predefinedOptions = ["1 Week", "2 Weeks", "3 Weeks", "4 Weeks", "1 Month", "Consign", "Manual"];
    const creditOpt = purchase.credit_option || "";
    const isCustomCredit = creditOpt && !predefinedOptions.includes(creditOpt);

    setFormData({ date: purchase.date || "", supplier_id: purchase.supplier_id || "", status: purchaseStatus, notes: purchase.notes || "", discount: purchase.discount || 0, tax: purchase.tax || 0, payment_type: purchase.payment_type || "Cash Down", credit_option: isCustomCredit ? "Manual" : creditOpt, manual_credit: isCustomCredit ? creditOpt : "" });

    if (items && items.length > 0) {
      setLineItems(items.map((item, idx) => {
        // Find matching inventory item
        const invItem = inventory.find(i => i.item_name.toLowerCase() === item.item_name.toLowerCase());
        return {
          id: idx + 1,
          item_name: item.item_name || "",
          qty: item.qty || "",
          foc_qty: item.foc_qty || "",
          unit_price: item.unit_price || "",
          total_price: item.total_price || "",
          type: item.type || "",
          inventory_id: invItem ? String(invItem.id) : "",
          expiry_date: item.expiry_date ? item.expiry_date.split("T")[0] : ""
        };
      }));
      setNextItemId(items.length + 1);
    } else {
      setLineItems([{ id: 1, item_name: "", qty: "", unit_price: "", total_price: "", type: "", inventory_id: "", foc_qty: "", expiry_date: "" }]);
      setNextItemId(2);
    }

    setIsEditing(true);
    setEditId(purchase.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.supplier_id) {
      return Swal.fire("Error", "Please select a supplier", "error");
    }

    const validItems = lineItems.filter((item) => item.item_name.trim() && item.qty && item.unit_price);
    if (validItems.length === 0) {
      return Swal.fire("Error", "Please add at least one item with quantity and price", "error");
    }

    const discountPercent = parseFloat(formData.discount) || 0;
    const taxPercent = parseFloat(formData.tax) || 0;
    const paymentType = formData.payment_type || "Cash Down";
    const creditOption = formData.payment_type === "Credit" ? (formData.credit_option === "Manual" ? formData.manual_credit || "" : formData.credit_option || "") : "";

    // Calculate adjusted unit price for each item (after discount and tax)
    // Formula: adjustedPrice = unitPrice * (1 - discount/100) * (1 + tax/100)
    const calculateAdjustedPrice = (basePrice) => {
      const afterDiscount = basePrice * (1 - discountPercent / 100);
      const afterTax = afterDiscount * (1 + taxPercent / 100);
      return afterTax;
    };

    // Calculate grand total from adjusted prices (exclude FOC qty)
    const totalAmount = validItems.reduce((sum, item) => {
      const qty = parseFloat(item.qty) || 0;
      const focQty = parseFloat(item.foc_qty) || 0;
      const billableQty = qty - focQty; // Exclude FOC from price calculation
      const basePrice = parseFloat(item.unit_price) || 0;
      const adjustedPrice = calculateAdjustedPrice(basePrice);
      return sum + (billableQty * adjustedPrice);
    }, 0).toFixed(2);

    try {
      if (isEditing && editId) {
        // Update purchase
        const { error: updateError } = await supabase.from("purchases").update({
          date: formData.date,
          supplier_id: parseInt(formData.supplier_id),
          notes: formData.notes,
          total_amount: totalAmount,
          discount: discountPercent,
          tax: taxPercent,
          payment_type: paymentType,
          credit_option: creditOption
        }).eq("id", editId);

        if (updateError) throw updateError;

        // Delete old items and insert new ones with adjusted prices
        await supabase.from("purchase_items").delete().eq("purchase_id", editId);

        const itemsToInsert = validItems.map((item) => {
          const basePrice = parseFloat(item.unit_price) || 0;
          const adjustedPrice = calculateAdjustedPrice(basePrice);
          const qty = parseFloat(item.qty) || 0;
          const focQty = parseFloat(item.foc_qty) || 0;
          const billableQty = qty - focQty; // Exclude FOC from price
          return {
            purchase_id: editId,
            item_name: item.item_name.trim(),
            original_qty: qty,
            qty: qty,
            foc_qty: focQty,
            unit_price: adjustedPrice,
            total_price: billableQty * adjustedPrice,
            type: item.type || "-",
            expiry_date: item.expiry_date || null
          };
        });
        await supabase.from("purchase_items").insert(itemsToInsert);

        Swal.fire("Success", "Purchase updated!", "success");
      } else {
        // Create new purchase
        const invoiceNumber = generateInvoiceNumber();
        const { data: newPurchase, error: insertError } = await supabase.from("purchases").insert([{
          invoice_number: invoiceNumber,
          date: formData.date,
          supplier_id: parseInt(formData.supplier_id),
          total_amount: totalAmount,
          notes: formData.notes || null,
          discount: discountPercent,
          tax: taxPercent,
          payment_type: paymentType,
          credit_option: creditOption
        }]).select().single();

        if (insertError) throw insertError;

        const itemsToInsert = validItems.map((item) => {
          const basePrice = parseFloat(item.unit_price) || 0;
          const adjustedPrice = calculateAdjustedPrice(basePrice);
          const qty = parseFloat(item.qty) || 0;
          const focQty = parseFloat(item.foc_qty) || 0;
          const billableQty = qty - focQty; // Exclude FOC from price
          return {
            purchase_id: newPurchase.id,
            item_name: item.item_name.trim(),
            original_qty: qty,
            qty: qty,
            foc_qty: focQty,
            unit_price: adjustedPrice,
            total_price: billableQty * adjustedPrice,
            type: item.type || "-",
            expiry_date: item.expiry_date || null
          };
        });
        await supabase.from("purchase_items").insert(itemsToInsert);

        Swal.fire("Success", "Purchase created!", "success");
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error("Error:", err);
      Swal.fire("Error", err.message || "Failed to save purchase", "error");
    }
  };

  const handleComplete = async (purchase) => {
    const result = await Swal.fire({
      title: "Complete Purchase?",
      text: "This will add items to inventory. This action cannot be undone.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Complete",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        const { data: items } = await supabase.from("purchase_items").select("*").eq("purchase_id", purchase.id);

        if (!items || items.length === 0) {
          return Swal.fire("Error", "No items found", "error");
        }

        // Add to inventory
        for (const item of items) {
          const { data: existing } = await supabase.from("inventory").select("*").ilike("item_name", item.item_name.trim()).maybeSingle();

          if (existing) {
            await supabase.from("inventory").update({
              qty: existing.qty + item.qty,
              price: item.unit_price,
              type: item.type || "-"
            }).eq("id", existing.id);
          } else {
            await supabase.from("inventory").insert([{
              item_name: item.item_name.trim(),
              qty: item.qty,
              type: item.type || "-",
              price: item.unit_price
            }]);
          }
        }

        // Update status to received for both Cash Down and Credit
        await supabase.from("purchases").update({ status: "received" }).eq("id", purchase.id);

        Swal.fire("Success", "Purchase completed and inventory updated!", "success");
        fetchData();

        if (setInventory) {
          const { data } = await supabase.from("inventory").select("*").order("id", { ascending: true });
          setInventory(data || []);
        }
      } catch (err) {
        console.error("Error:", err);
        Swal.fire("Error", err.message || "Failed to complete purchase", "error");
      }
    }
  };

  const handleCancel = async (purchase) => {
    const result = await Swal.fire({
      title: "Cancel Purchase?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel",
      cancelButtonText: "No"
    });

    if (result.isConfirmed) {
      try {
        await supabase.from("purchases").update({ status: "cancelled" }).eq("id", purchase.id);
        Swal.fire("Cancelled", "Purchase cancelled.", "success");
        fetchData();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to cancel", "error");
      }
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Delete this purchase?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel"
    });

    if (result.isConfirmed) {
      try {
        await supabase.from("purchase_items").delete().eq("purchase_id", id);
        const { error } = await supabase.from("purchases").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Purchase deleted.", "success");
        fetchData();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const getStatusBadge = (status, paymentType) => {
    const styles = {
      pending: "bg-amber-100 text-amber-700",
      received: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-rose-100 text-rose-700"
    };
    // For Credit purchases that are received (staying to pay), show custom text
    const paymentTypeStr = String(paymentType || "").toLowerCase();
    const isCreditUnpaid = paymentTypeStr === "credit" && status === "received";
    const statusText = isCreditUnpaid ? "received " : (status || "pending");
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>{statusText}</span>;
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Purchase Order</h1>
          <p className="text-sm text-slate-500 mt-1">Manage purchase orders</p>
        </div>
        {canManage && (
          <button onClick={openAddModal} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            + New Purchase
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <input type="text" placeholder="Search by invoice number or supplier..." value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">All Time</option>
            <option value="day">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Date</option>
          </select>
          {dateFilter === "custom" && (
            <div className="flex gap-2">
              <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Invoice #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : filteredPurchases.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No purchases found</td></tr>
            ) : (
              paginatedPurchases.map((purchase) => {
                const isStayToPay = purchase.status === "Received" && !purchase.paid && String(purchase.payment_type || "").toLowerCase() === "credit";
                const isCompleted = purchase.status === "Received" && (purchase.paid || String(purchase.payment_type || "").toLowerCase() === "cash down");
                return (
                <tr key={purchase.id} className={`border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 ${isStayToPay ? "bg-red-50 dark:bg-red-900/20" : ""} ${isCompleted ? "bg-green-50 dark:bg-green-900/20" : ""}`}>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    <button onClick={() => viewDetails(purchase)} className="text-indigo-600 hover:text-indigo-800 underline">{purchase.invoice_number}</button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{purchase.date}</td>
                  <td className="px-4 py-3 text-slate-600">{getSupplierName(purchase.supplier_id)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 font-medium">{formatMMK(currentValues[purchase.id] || 0)}</td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(purchase.status, purchase.payment_type)}</td>
                  <td className="px-4 py-3 text-center">
                    {canManage && (
                      <div className="flex justify-center gap-2">
                        {(purchase.status === "pending" || !purchase.status) && (
                          <>
                            <button onClick={() => openEditModal(purchase)} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Edit</button>
                            <button onClick={() => handleComplete(purchase)} className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">Complete</button>
                            <button onClick={() => handleCancel(purchase)} className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700">Cancel</button>
                          </>
                        )}
                        {purchase.status === "received" && (
                          (purchase.paid || String(purchase.payment_type || "").toLowerCase() === "cash down") ? (
                            <span className="text-xs text-emerald-600 font-medium">Completed</span>
                          ) : (
                            <span className="text-xs text-blue-600 font-medium">Stay to Pay</span>
                          )
                        )}
                        {purchase.status === "cancelled" && (
                          <button onClick={() => handleDelete(purchase.id)} className="px-2 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700">Delete</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-6 gap-2">
          <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Previous</button>
          <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 disabled:opacity-50 hover:bg-slate-100">Next</button>
        </div>
      )}

      {/* Details Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Purchase Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">X</button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Invoice #:</span><span className="ml-2 font-semibold">{selectedPurchase?.invoice_number}</span></div>
              <div><span className="text-slate-500">Date:</span><span className="ml-2">{selectedPurchase?.date}</span></div>
              <div><span className="text-slate-500">Supplier:</span><span className="ml-2">{getSupplierName(selectedPurchase?.supplier_id)}</span></div>
              <div><span className="text-slate-500">Status:</span><span className="ml-2">{getStatusBadge(selectedPurchase?.status, selectedPurchase?.payment_type)}</span></div>
              {selectedPurchase?.discount > 0 && (
                <div><span className="text-slate-500">Discount:</span><span className="ml-2 text-red-600">{selectedPurchase?.discount}%</span></div>
              )}
              {selectedPurchase?.tax > 0 && (
                <div><span className="text-slate-500">Tax:</span><span className="ml-2 text-blue-600">{selectedPurchase?.tax}%</span></div>
              )}
              <div><span className="text-slate-500">Payment:</span><span className="ml-2 font-medium">{selectedPurchase?.payment_type || "Cash Down"}</span></div>
              {selectedPurchase?.payment_type === "Credit" && selectedPurchase?.credit_option && (
                <div><span className="text-slate-500">Credit:</span><span className="ml-2 font-medium">{selectedPurchase?.credit_option}</span></div>
              )}
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">FOC</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Unit Price</th>
                    <th className="px-4 py-2 text-center font-semibold text-slate-700">Expiry Date</th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchaseItems.length > 0 ? selectedPurchaseItems.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-800">{item.item_name}</td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-2 text-center">
                        {item.foc_qty > 0 ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{item.foc_qty}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">{item.type || "-"}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{formatMMK(item.unit_price)}</td>
                      <td className="px-4 py-2 text-center text-slate-600">
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
                      <td className="px-4 py-2 text-right font-medium text-slate-800">{formatMMK(item.total_price)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-4 py-4 text-center text-slate-500">No items found</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right font-bold text-slate-800">Grand Total (Excl. FOC)</td>
                    <td className="px-4 py-2 text-right font-bold text-indigo-600">
                      {formatMMK(selectedPurchaseItems.reduce((sum, item) => {
                        const qty = parseFloat(item.qty) || 0;
                        const focQty = parseFloat(item.foc_qty) || 0;
                        const billableQty = qty - focQty;
                        return sum + (billableQty * (parseFloat(item.unit_price) || 0));
                      }, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {selectedPurchase?.notes && <div className="mt-4 text-sm"><span className="text-slate-500">Notes:</span><p className="text-slate-700 mt-1">{selectedPurchase.notes}</p></div>}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl p-6 w-full max-w-7xl shadow-xl mx-4">
            <h3 className="text-xl font-bold text-slate-800 mb-5">{isEditing ? "Edit Purchase" : "New Purchase"}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Invoice #</label>
                  <input type="text" value={isEditing ? selectedPurchase?.invoice_number || "Auto-generated" : generateInvoiceNumber()} disabled className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-slate-100 text-slate-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date *</label>
                  <input type="date" name="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Supplier *</label>
                  <select name="supplier_id" value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                    <option value="">Select Supplier</option>
                    {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Items *</label>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Select from Inventory</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700">Item Name</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700 w-20">Qty</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700 w-20">FOC</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-700 w-20">Unit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700 w-24">Buying Price</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700 w-24">Unit Per Price</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-700 w-36">Expiry Date</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700 w-24">Total</th>
                        {canManage && <th className="px-3 py-2 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            <select value={item.inventory_id} onChange={(e) => updateLineItem(item.id, "inventory_id", e.target.value)}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                              <option value="">-- New Item --</option>
                              {inventory.map((inv) => (
                                <option key={inv.id} value={inv.id}>{inv.item_name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={item.item_name} onChange={(e) => updateLineItem(item.id, "item_name", e.target.value)} placeholder="Enter or select item" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.qty} onChange={(e) => updateLineItem(item.id, "qty", e.target.value)} placeholder="0" min="0" step="0.01" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.foc_qty} onChange={(e) => updateLineItem(item.id, "foc_qty", e.target.value)} placeholder="0" min="0" step="0.01" className="w-full px-2 py-1.5 border border-emerald-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-emerald-50" title="Free of Charge quantity" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={item.type} onChange={(e) => updateLineItem(item.id, "type", e.target.value)} placeholder="kg, pcs, box" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                           <td className="px-3 py-2">
                            <input type="number" value={item.buying_price} onChange={(e) => updateLineItem(item.id, "buying_price", e.target.value)} placeholder="0.00" min="0" step="0.01" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={item.unit_price} onChange={(e) => updateLineItem(item.id, "unit_price", e.target.value)} placeholder="0.00" min="0" step="0.01" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="date" value={item.expiry_date || ""} onChange={(e) => updateLineItem(item.id, "expiry_date", e.target.value)} min={formData.date} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">
                            <div className="text-sm">{formatMMK(item.total_price)}</div>
                            {item.foc_qty > 0 && (
                              <div className="text-xs text-emerald-600">FOC: {item.foc_qty}</div>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-3 py-2 text-center">
                              <button type="button" onClick={() => removeLineItem(item.id)} className="text-rose-500 hover:text-rose-700 font-bold">X</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canManage && <button type="button" onClick={addLineItem} className="mt-2 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium">+ Add Item</button>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Discount (%)</label>
                    <input
                      type="number"
                      name="discount"
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                      placeholder="0"
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tax (%)</label>
                    <input
                      type="number"
                      name="tax"
                      value={formData.tax}
                      onChange={(e) => setFormData({ ...formData, tax: e.target.value })}
                      placeholder="0"
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Payment Type</label>
                    <select
                      name="payment_type"
                      value={formData.payment_type}
                      onChange={(e) => setFormData({ ...formData, payment_type: e.target.value, credit_option: e.target.value === "Credit" ? formData.credit_option : "" })}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Cash Down">Cash Down</option>
                      <option value="Credit">Credit</option>
                    </select>
                  </div>
                  {formData.payment_type === "Credit" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Credit Option</label>
                      {formData.credit_option === "Manual" ? (
                        <input
                          type="text"
                          name="manual_credit"
                          value={formData.manual_credit || ""}
                          onChange={(e) => setFormData({ ...formData, manual_credit: e.target.value })}
                          placeholder="Enter credit terms..."
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <select
                          name="credit_option"
                          value={formData.credit_option}
                          onChange={(e) => setFormData({ ...formData, credit_option: e.target.value, manual_credit: "" })}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Select Option</option>
                          <option value="1 Week">1 Week</option>
                          <option value="2 Weeks">2 Weeks</option>
                          <option value="3 Weeks">3 Weeks</option>
                          <option value="4 Weeks">4 Weeks</option>
                          <option value="1 Month">1 Month</option>
                          <option value="Consign">Consign</option>
                          <option value="Manual">Manual</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <span className="text-sm text-slate-500">Subtotal: </span>
                    <span className="text-sm font-medium text-slate-700">{formatMMK(calculateSubTotal())}</span>
                  </div>
                  <div className="mb-2">
                    <span className="text-sm text-slate-500">Discount ({formData.discount || 0}%): </span>
                    <span className="text-sm font-medium text-red-600">-{formatMMK(calculateDiscountAmount())}</span>
                  </div>
                  {formData.tax > 0 && (
                    <div className="mb-2">
                      <span className="text-sm text-slate-500">Tax ({formData.tax || 0}%): </span>
                      <span className="text-sm font-medium text-blue-600">+{formatMMK(calculateTaxAmount())}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-semibold text-slate-700">Grand Total: </span>
                    <span className="text-lg font-bold text-indigo-600">{formatMMK(calculateGrandTotal())}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} placeholder="Optional notes..." className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">{isEditing ? "Update Purchase" : "Save Purchase"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}