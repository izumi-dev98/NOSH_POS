import { useEffect, useState, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Pyaments({ inventory, setInventory, user }) {
  const [menu, setMenu] = useState([]);
  const [menuSets, setMenuSets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [menuSetItemsMap, setMenuSetItemsMap] = useState({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentType, setPaymentType] = useState("Cash"); // "Cash", "Kpay", or "FOC"
  const [remark, setRemark] = useState("");
  const [discountTypes, setDiscountTypes] = useState([]);
  const [selectedDiscountType, setSelectedDiscountType] = useState(null);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const COUPONS = {
    KAPY10: { code: "KAPY10", type: "percent", value: 10, name: "Kapy 10%" },
    KAPY50: { code: "KAPY50", type: "fixed", value: 5000, name: "Kapy MMK 5,000" },
  };

  const isAdmin = user?.role === "superadmin" || user?.role === "admin";

  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  const [editQty, setEditQty] = useState({});
  const [itemDiscounts, setItemDiscounts] = useState({}); // { "id-isSet": discount amount }
  const [itemDiscountTypeSelections, setItemDiscountTypeSelections] = useState({}); // { "id-isSet": discountTypeId }
  const fetchMenu = async () => {
    try {
      const { data: menuData, error: menuErr } = await supabase
        .from("menu")
        .select("*");
      if (menuErr) throw menuErr;

      const { data: ingData, error: ingErr } = await supabase
        .from("menu_ingredients")
        .select("*");
      if (ingErr) throw ingErr;

      const map = {};
      ingData.forEach((ing) => {
        if (!map[ing.menu_id]) map[ing.menu_id] = [];
        map[ing.menu_id].push(ing);
      });
      setIngredientsMap(map);

      const merged = menuData.map((m) => ({
        ...m,
        status: m.status ?? "active",
        ingredients: map[m.id] || [],
        isSet: false,
      }));
      setMenu(merged);

      // Fetch menu sets
      const { data: setsData, error: setsErr } = await supabase
        .from("menu_sets")
        .select("*");
      if (setsErr) throw setsErr;

      const { data: setItemsData, error: setItemsErr } = await supabase
        .from("menu_set_items")
        .select("*");
      if (setItemsErr) throw setItemsErr;

      const setItemsMap = {};
      setItemsData.forEach((item) => {
        if (!setItemsMap[item.set_id]) setItemsMap[item.set_id] = [];
        setItemsMap[item.set_id].push(item);
      });
      setMenuSetItemsMap(setItemsMap);

      const mergedSets = setsData.map((s) => ({
        ...s,
        menu_name: s.set_name,
        menu_items: setItemsMap[s.id] || [],
        isSet: true,
      }));
      setMenuSets(mergedSets);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu", "error");
      setMenu([]);
      setMenuSets([]);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("categories").select("*").order("name", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  };

  // Fetch discount types
  const fetchDiscountTypes = async () => {
    try {
      const { data, error } = await supabase.from("discount_types").select("*").order("id", { ascending: true });
      if (error) throw error;
      setDiscountTypes(data || []);
    } catch (err) {
      console.error("Failed to load discount types:", err);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchCategories();
    fetchDiscountTypes();
  }, []);

  const filteredMenu = useMemo(
    () => {
      const allItems = [...menu, ...menuSets];
      return allItems.filter((m) => {
        const matchesSearch = (m.menu_name || "").toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === "all" || m.category_id === Number(selectedCategory);
        const matchesStatus = m.isSet || m.status === "active";
        return matchesSearch && matchesCategory && matchesStatus;
      });
    },
    [menu, menuSets, search, selectedCategory],
  );

  const addToCart = (item) => {
    if (item.isSet) {
      // Handle menu set
      const setItems = menuSetItemsMap[item.id] || [];
      let maxQty = Infinity;

      // Check stock for all menu items in the set
      for (const setItem of setItems) {
        const menuItem = menu.find(m => m.id === setItem.menu_id);
        if (!menuItem) continue;

        const ingredients = ingredientsMap[menuItem.id] || [];
        for (const ing of ingredients) {
          const inv = safeInventory.find((i) => i.id === ing.inventory_id);
          const stock = inv ? Math.floor(inv.qty / ing.qty) : 0;
          if (stock < maxQty) maxQty = stock;
        }
      }

      setCart((prev) => {
        const exist = prev.find((c) => c.id === item.id && c.isSet === item.isSet);
        if (exist) {
          if (exist.qty >= maxQty && maxQty > 0) {
            Swal.fire(
              "Stock Limit",
              `Cannot add more ${item.menu_name}`,
              "warning",
            );
            return prev;
          }
          return prev.map((c) =>
            c.id === item.id && c.isSet === item.isSet ? { ...c, qty: c.qty + 1 } : c,
          );
        }
        return [...prev, { ...item, qty: 1 }];
      });
    } else {
      // Handle regular menu item
      const ingredients = ingredientsMap[item.id] || [];
      let maxQty = Infinity;

      for (const ing of ingredients) {
        const inv = safeInventory.find((i) => i.id === ing.inventory_id);
        const stock = inv ? Math.floor(inv.qty / ing.qty) : 0;
        if (stock < maxQty) maxQty = stock;
      }

      setCart((prev) => {
        const exist = prev.find((c) => c.id === item.id && !c.isSet);
        if (exist) {
          if (exist.qty >= maxQty && maxQty > 0) {
            Swal.fire(
              "Stock Limit",
              `Cannot add more ${item.menu_name}`,
              "warning",
            );
            return prev;
          }
          return prev.map((c) =>
            c.id === item.id && !c.isSet ? { ...c, qty: c.qty + 1 } : c,
          );
        }
        return [...prev, { ...item, qty: 1 }];
      });
    }
  };

  const changeQty = (id, diff, isSet) => {
    setEditQty((prev) => {
      const n = { ...prev };
      delete n[`${id}-${isSet}`];
      return n;
    });
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id === id && c.isSet === isSet) {
            const newQty = c.qty + diff;
            if (newQty <= 0) return null;
            // Allow any quantity - no stock limit alerts
            return { ...c, qty: newQty };
          }
          return c;
        })
        .filter(Boolean),
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setPaymentType("Cash");
    setRemark("");
    setSelectedDiscountType(null);
    setAppliedCoupon(null);
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0); // original prices
  const itemDiscountAmount = cart.reduce((sum, i) => {
    const key = `${i.id}-${i.isSet}`;
    const discAmt = itemDiscounts[key];
    if (discAmt != null) {
      return sum + Number(discAmt) * i.qty;
    }
    return sum;
  }, 0);
  const itemDiscountedSubtotal = subtotal - itemDiscountAmount;
  const discountPercent = Number(discount) || 0;
  const taxPercent = Number(tax) || 0;
  const fixedDiscountAmount = selectedDiscountType?.discount_amount ? Number(selectedDiscountType.discount_amount) : 0;
  const orderDiscountAmount = fixedDiscountAmount > 0
    ? Math.min(fixedDiscountAmount, itemDiscountedSubtotal)
    : itemDiscountedSubtotal * (discountPercent / 100);
  const totalDiscountAmount = itemDiscountAmount + orderDiscountAmount;
  // Coupon: percent coupons are applied on the original subtotal (origin amount)
  const couponDiscount = appliedCoupon
    ? appliedCoupon.type === "percent"
      ? subtotal * (appliedCoupon.value / 100)
      : Number(appliedCoupon.value || 0)
    : 0;
  const taxAmount = itemDiscountedSubtotal * (taxPercent / 100);
  const total = itemDiscountedSubtotal - orderDiscountAmount - couponDiscount + taxAmount;

  const completeOrder = async () => {
    if (!cart.length)
      return Swal.fire("Cart Empty", "Add items first", "warning");

    try {
      const updatedInventory = safeInventory.map((i) => ({ ...i }));

      // Allow negative inventory - no stock check
      // for (const item of cart) {
      //   if (item.isSet) {
      //     const setItems = menuSetItemsMap[item.id] || [];
      //     for (const setItem of setItems) {
      //       const menuItem = menu.find(m => m.id === setItem.menu_id);
      //       if (!menuItem) continue;
      //       const ingredients = ingredientsMap[menuItem.id] || [];
      //       for (const ing of ingredients) {
      //         const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
      //         if (!inv || inv.qty < ing.qty * item.qty) {
      //           throw new Error(`Not enough ${inv?.item_name || "Unknown"} for ${item.menu_name}`);
      //         }
      //       }
      //     }
      //   } else {
      //     const ingredients = ingredientsMap[item.id] || [];
      //     for (const ing of ingredients) {
      //       const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
      //       if (!inv || inv.qty < ing.qty * item.qty) {
      //         throw new Error(`Not enough ${inv?.item_name || "Unknown"} for ${item.menu_name}`);
      //       }
      //     }
      //   }
      // }

      // Insert order with pending status
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert([
          {
            subtotal,
            discount_percent: discountPercent,
            discount_amount: orderDiscountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount,
            total,
            status: "pending",
            payment_type: paymentType,
            remark: remark || null,
            discount_type: selectedDiscountType?.name || null,
            role: user?.role || null,
          },
        ])
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Insert order items only.
      // Inventory will be deducted when order is marked completed in History page.
      for (const item of cart) {
        const key = `${item.id}-${item.isSet}`;
        const discAmt = itemDiscounts[key] != null ? Number(itemDiscounts[key]) : 0;
        const effectivePrice = item.price - discAmt;
        const origPrice = item.price;
        if (item.isSet) {
          await supabase.from("order_items").insert({
            order_id: order.id,
            menu_id: null,
            menu_set_id: item.id,
            qty: item.qty,
            price: effectivePrice,
            original_price: origPrice,
          });
        } else {
          await supabase.from("order_items").insert({
            order_id: order.id,
            menu_id: item.id,
            menu_set_id: null,
            qty: item.qty,
            price: effectivePrice,
            original_price: origPrice,
          });
        }
      }

      // Print receipt
      const date = new Date().toLocaleString();
      const itemDiscountHTMLLines = cart
        .filter((c) => itemDiscounts[`${c.id}-${c.isSet}`] != null)
        .map((c) => {
          const key = `${c.id}-${c.isSet}`;
          const discAmt = Number(itemDiscounts[key]);
          const finalPrice = c.price - discAmt;
          const totalDisc = discAmt * c.qty;
          return `  - ${c.menu_name} (discount ${mmkFormatter.format(discAmt)} × ${c.qty}): -${mmkFormatter.format(totalDisc)}`;
        });
      const receiptContent = `
        <html>
          <head><title>Order #${order.id}</title></head>
          <body style="font-family: monospace; width: 300px; padding: 10px;">
            <h1 style="text-align:center;">F&B ATY SLIP </h1>
            <p>Slip ID: ${order.id}</p>
            <p>Date: ${date}</p>
            ${remark ? `<p>Remark: ${remark}</p>` : ""}
            <table style="width:100%; border-collapse: collapse;">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                ${cart
                  .map(
                    (i) => `<tr>
                  <td>${i.menu_name}${i.isSet ? ' (Set)' : ''}</td>
                  <td>${i.qty}</td>
                  <td>${mmkFormatter.format(i.price)}</td>
                  <td>${mmkFormatter.format(i.price * i.qty)}</td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
            <hr/>
            <div style="text-align:right;">
              <p>Subtotal: ${mmkFormatter.format(subtotal)}</p>
              ${itemDiscountHTMLLines.map(l => `<p style="color:black;">${l}</p>`).join("")}
              ${orderDiscountAmount > 0 ? `<p style="color:black;">Discount (${discountPercent}%): -${mmkFormatter.format(orderDiscountAmount)}</p>` : ""}
              ${couponDiscount > 0 ? `<p style="color:black;">Coupon${appliedCoupon?.code ? ` (${appliedCoupon.code})` : ""}: -${mmkFormatter.format(couponDiscount)}</p>` : ""}
              ${taxPercent > 0 ? `<p style="color:black;">Tax (${taxPercent}%): +${mmkFormatter.format(taxAmount)}</p>` : ""}
              <p style="font-weight:bold; font-size:1.2em;">Total: ${mmkFormatter.format(total)}</p>
            </div>
            <p style="text-align:center;">Thank you!</p>
          </body>
        </html>
      `;

      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(receiptContent);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      document.body.removeChild(iframe);

      setCart([]);
      setDiscount(0);
      setTax(0);
      setRemark("");
      setItemDiscounts({});
      setEditQty({});
      setAppliedCoupon(null);
      Swal.fire("Success", "Order printed successfully!", "success");
      fetchMenu();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to create order", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-7">
      {/* Menu */}
      <div className="bg-white rounded-2xl shadow-md p-6 lg:col-span-4 max-h-[calc(100vh-3rem)] overflow-hidden flex flex-col">
        <div className="sticky top-0 z-10 bg-white pb-4">
          <h2 className="text-3xl font-bold mb-5">Menu</h2>
          <input
            type="text"
            placeholder="Search menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 mb-4 border rounded-xl"
          />

          {/* Category Filter Tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
              selectedCategory === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id.toString())}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                selectedCategory === cat.id.toString()
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredMenu.map((item) => (
            <button
              key={`${item.id}-${item.isSet ? 'set' : 'menu'}`}
              onClick={() => addToCart(item)}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow">
                {mmkFormatter.format(item.price)}
              </div>

              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500" />

              <div className="pr-24 pt-2">
                <p className="font-semibold text-slate-900 leading-tight">
                  {item.menu_name}
                </p>
                <div className="mt-2">
                  {item.isSet ? (
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      Menu Set
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Menu
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Cart */}
      <div className="bg-white rounded-2xl shadow-md p-6 lg:col-span-3">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Cart</h2>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            {cart.length} item{cart.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          <div className="space-y-3">
          {cart.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-slate-400">
              Your cart is empty
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div
                key={`${item.id}-${item.isSet ? 'set' : 'menu'}`}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.menu_name}
                      {item.isSet && <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">SET</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mmkFormatter.format(item.price)} each
                    </p>
                  </div>
                  <p className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                    {mmkFormatter.format(item.price * item.qty)}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white">
                    <button
                      onClick={() => changeQty(item.id, -1, item.isSet)}
                      className="px-3 py-1.5 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editQty[`${item.id}-${item.isSet}`] ?? item.qty}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setEditQty((prev) => ({ ...prev, [`${item.id}-${item.isSet}`]: val }));
                      }}
                      onBlur={(e) => {
                        const num = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                        if (!isNaN(num) && num >= 1) {
                          setCart((prev) =>
                            prev.map((c) =>
                              c.id === item.id && c.isSet === item.isSet ? { ...c, qty: num } : c
                            )
                          );
                        }
                        setEditQty((prev) => {
                          const n = { ...prev };
                          delete n[`${item.id}-${item.isSet}`];
                          return n;
                        });
                      }}
                      className="w-14 px-2 py-1 text-center text-sm font-semibold text-slate-800 outline-none bg-transparent border border-transparent focus:border-slate-300 rounded"
                    />
                    <button
                      onClick={() => changeQty(item.id, 1, item.isSet)}
                      className="px-3 py-1.5 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => changeQty(item.id, -item.qty, item.isSet)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Remove
                  </button>
                </div>

                {/* Per-item discount */}
                <div className="mt-2">
                  <label className="block text-xs text-slate-500 mb-1">Discount Type</label>
                  <select
                    value={itemDiscountTypeSelections[`${item.id}-${item.isSet}`] || ""}
                    onChange={(e) => {
                      const key = `${item.id}-${item.isSet}`;
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        setItemDiscountTypeSelections((prev) => {
                          const n = { ...prev };
                          delete n[key];
                          return n;
                        });
                        setItemDiscounts((prev) => {
                          const n = { ...prev };
                          delete n[key];
                          return n;
                        });
                        return;
                      }

                      const selectedType = discountTypes.find((dt) => String(dt.id) === selectedId);
                      if (!selectedType) return;

                      setItemDiscountTypeSelections((prev) => ({ ...prev, [key]: selectedId }));
                      const discountValue = selectedType.discount_amount > 0
                        ? Number(selectedType.discount_amount)
                        : Math.round((item.price * Number(selectedType.discount_percent)) / 100);
                      setItemDiscounts((prev) => ({ ...prev, [key]: discountValue }));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Select discount</option>
                    {discountTypes.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name} {dt.discount_amount > 0 ? `(${mmkFormatter.format(dt.discount_amount)})` : `(${dt.discount_percent}%)`}
                      </option>
                    ))}
                  </select>
                </div>
                {itemDiscounts[`${item.id}-${item.isSet}`] != null && Number(itemDiscounts[`${item.id}-${item.isSet}`]) > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    Original: {mmkFormatter.format(item.price)} → Final: {mmkFormatter.format(item.price - Number(itemDiscounts[`${item.id}-${item.isSet}`]))}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
          </div>
        </div>

        {/* Payment Type Selection */}
        <div className="mt-4 border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Type
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (paymentType === "FOC") {
                  setDiscount(0);
                }
                setPaymentType("Kpay");
                setAppliedCoupon(null);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Kpay"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Kpay
            </button>
            <button
              onClick={() => {
                if (paymentType === "FOC") {
                  setDiscount(0);
                }
                setPaymentType("Cash");
                setAppliedCoupon(null);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Cash"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Cash
            </button>
            <button
              onClick={() => {
                if (paymentType === "FOC") {
                  setDiscount(0);
                }
                setPaymentType("Coupon");
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Coupon"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Coupon
            </button>
            <button
              onClick={() => {
                setPaymentType("FOC");
                setDiscount(100);
                setAppliedCoupon(null);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "FOC"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              FOC
            </button>
          </div>
        </div>

        {/* Discount Form */}
        <div className="mt-4 border-t pt-4">
          {discountTypes.length > 0 && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Type
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDiscountType(null);
                    setDiscount(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    !selectedDiscountType
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Manual
                </button>
                {discountTypes.map((dt) => (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => {
                      setSelectedDiscountType(dt);
                      if (dt.discount_amount > 0) {
                        setDiscount(0);
                      } else {
                        setDiscount(dt.discount_percent);
                      }
                      setAppliedCoupon(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      selectedDiscountType?.id === dt.id
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {dt.name} {dt.discount_amount > 0 ? `(${mmkFormatter.format(dt.discount_amount)})` : `(${dt.discount_percent}%)`}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Discount (%)
          </label>
          <input
            type="text"
            inputMode="numeric"
            min="0"
            max="100"
            value={discount}
            onChange={(e) => {
              setDiscount(Math.min(100, Math.max(0, Number(e.target.value))));
              setSelectedDiscountType(null);
            }}
            className="w-full p-2 border rounded-xl"
            placeholder="Enter discount %"
            disabled={paymentType === "FOC"}
          />
        </div>

        {/* Tax Form */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tax (%)
          </label>
          <input
            type="text"
            inputMode="numeric"
            min=""
            max="100"
            value={tax}
            onChange={(e) =>
              setTax(Math.min(100, Math.max(0, Number(e.target.value))))
            }
            className="w-full p-2 border rounded-xl"
            placeholder="Enter tax %"
          />
        </div>

        {/* Price Summary */}
        <div className="mt-4 border-t pt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Subtotal:</span>
            <span>
              {mmkFormatter.format(itemDiscountedSubtotal)}
              {itemDiscountedSubtotal !== subtotal && (
                <span className="ml-1 text-xs text-slate-400 line-through">{mmkFormatter.format(subtotal)}</span>
              )}
            </span>
          </div>
          {(discountPercent > 0 || fixedDiscountAmount > 0) && (
            <div className="flex justify-between text-sm mb-1 text-red-500">
              <span>
                {selectedDiscountType
                  ? `Discount (${selectedDiscountType.name}${selectedDiscountType.discount_amount > 0 ? "" : ` ${selectedDiscountType.discount_percent}%`})`
                  : `Discount (${discountPercent}%)`}
              </span>
              <span>-{mmkFormatter.format(orderDiscountAmount)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex justify-between text-sm mb-1 text-red-500">
              <span>Coupon{appliedCoupon?.code ? ` (${appliedCoupon.code})` : ""}:</span>
              <span>-{mmkFormatter.format(couponDiscount)}</span>
            </div>
          )}
          {taxPercent > 0 && (
            <div className="flex justify-between text-sm mb-1 text-blue-500">
              <span>Tax ({taxPercent}%):</span>
              <span>+{mmkFormatter.format(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-xl mt-2">
            <span>Total</span>
            <span>{mmkFormatter.format(total)}</span>
          </div>
        </div>

        {/* Remark Input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remark
          </label>
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="w-full p-2 border rounded-xl"
            placeholder="Enter remark..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={clearCart}
            className="flex-1 bg-red-500 text-white py-3 rounded-2xl hover:bg-red-600"
          >
            Clear Cart
          </button>
          <button
            onClick={completeOrder}
            className="flex-1 bg-blue-600 text-white py-3 rounded-2xl hover:bg-blue-700"
          >
            Print Order
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

