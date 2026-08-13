import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Swal from "sweetalert2";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Payments from "./pages/Pyaments";
import History from "./pages/History";
import Menu from "./pages/Menu";
import Category from "./pages/Category";
import Inventory from "./pages/Inventory";

import supabase from "./createClients";
import { fetchExpiringSoonPurchaseItems, runExpiryCheck } from "./utils/expiryService";
import InventoryReport from "./pages/InventoryReport";
import TotalSalesReport from "./pages/TotalSalesReport";
import UsageReport from "./pages/UsageReport";
import AddStockReport from "./pages/AddStockReport";
import ProfitLossReport from "./pages/ProfitLossReport";
import UserRight from "./pages/UserRight";

import UserCreate from "./pages/UserCreate";
import InternalConsumption from "./pages/InternalConsumption";
import DiscountType from "./pages/DiscountType";

import PrivateRoute from "./pages/PrivateRoute";
import Login from "./pages/Login";
import Logout from "./pages/Logout";

import Supplier from "./pages/Supplier";
import Purchase from "./pages/Purchase";
import PurchaseReturn from "./pages/PurchaseReturn";
import PurchaseReport from "./pages/PurchaseReport";
import PurchaseReturnReport from "./pages/PurchaseReturnReport";
import ExpiredReport from "./pages/ExpiredReport";
import SupplierOutstanding from "./pages/SupplierOutstanding";
import SaleUsageReport from "./pages/SaleUsageReport";
import TopSellingMenuReport from "./pages/TopSellingMenuReport";

export default function App() {
  const [isOpen, setIsOpen] = useState(window.innerWidth >= 768);
  const [inventory, setInventory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.remove("glass");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ------------------- RESPONSIVE SIDEBAR -------------------
  useEffect(() => {
    const handleResize = () => setIsOpen(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen((prev) => !prev);
  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // ------------------- AUTH STATE -------------------
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ------------------- EXPIRY CHECK -------------------
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const run = async () => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];

      const tomorrowDate = new Date(now);
      tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
      const tomorrow = tomorrowDate.toISOString().split("T")[0];

      const weekDate = new Date(now);
      weekDate.setUTCDate(weekDate.getUTCDate() + 7);
      const week = weekDate.toISOString().split("T")[0];

      const [expiredResults, expiringSoon] = await Promise.all([
        runExpiryCheck(),
        fetchExpiringSoonPurchaseItems(7),
      ]);
      if (cancelled) return;

      const expiredLines = (expiredResults || []).map(
        (r) => `${r.item_name}: ${r.expired_qty} units expired on ${r.expiry_date}`
      );

      const expiringWithin1Day = (expiringSoon || []).filter((i) => i.expiry_date && i.expiry_date <= tomorrow);
      const expiringWithin1Week = (expiringSoon || []).filter((i) => i.expiry_date && i.expiry_date > tomorrow && i.expiry_date <= week);

      const expiring1DayLines = expiringWithin1Day.map(
        (i) => `${i.item_name}: ${i.qty} units expiring on ${i.expiry_date}`
      );
      const expiring1WeekLines = expiringWithin1Week.map(
        (i) => `${i.item_name}: ${i.qty} units expiring on ${i.expiry_date}`
      );

      if (expiredLines.length === 0 && expiring1DayLines.length === 0 && expiring1WeekLines.length === 0) {
        return;
      }

      while (!cancelled && Swal.isVisible()) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (cancelled) return;

      const sections = [];
      if (expiredLines.length > 0) {
        sections.push(`Expired & removed (as of ${today}):\n${expiredLines.join("\n")}`);
      }
      if (expiring1DayLines.length > 0) {
        sections.push(`Expiring within 1 day:\n${expiring1DayLines.join("\n")}`);
      }
      if (expiring1WeekLines.length > 0) {
        sections.push(`Expiring within 1 week:\n${expiring1WeekLines.join("\n")}`);
      }

      Swal.fire({
        title: "Expiry Alert",
        text: sections.join("\n\n"),
        icon: "warning",
        confirmButtonText: "OK",
      });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ------------------- INVENTORY -------------------
  const fetchInventory = async () => {
    const { data, error } = await supabase.from("inventory").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setInventory(data);
  };
  useEffect(() => { fetchInventory(); }, []);

  const addInventoryItem = async (item) => {
    const { data, error } = await supabase.from("inventory").insert([item]).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setInventory(prev => [...prev, data]); Swal.fire("Success", "Inventory added", "success"); }
  };
  const updateInventoryItem = async (id, updatedItem) => {
    const { data, error } = await supabase.from("inventory").update(updatedItem).eq("id", id).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setInventory(prev => prev.map(i => i.id === id ? data : i)); Swal.fire("Success", "Inventory updated", "success"); }
  };
  const deleteInventoryItem = async (id) => {
    const result = await Swal.fire({ title: "Delete Inventory?", icon: "warning", showCancelButton: true, confirmButtonText: "Yes" });
    if (result.isConfirmed) {
      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else { setInventory(prev => prev.filter(i => i.id !== id)); Swal.fire("Deleted", "Inventory removed", "success"); }
    }
  };

  // ------------------- MENU -------------------
  const fetchMenu = async () => {
    const { data, error } = await supabase.from("menu").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setMenu(data);
  };
  useEffect(() => { fetchMenu(); }, []);

  const addMenuItem = async (item) => {
    const { data, error } = await supabase.from("menu").insert([item]).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setMenu(prev => [...prev, data]); Swal.fire("Success", "Menu added", "success"); }
  };
  const updateMenuItem = async (id, updatedItem) => {
    const { data, error } = await supabase.from("menu").update(updatedItem).eq("id", id).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setMenu(prev => prev.map(m => m.id === id ? data : m)); Swal.fire("Updated", "Menu updated", "success"); }
  };
  const deleteMenuItem = async (id) => {
    const result = await Swal.fire({ title: "Delete Menu?", icon: "warning", showCancelButton: true, confirmButtonText: "Yes" });
    if (result.isConfirmed) {
      const { error } = await supabase.from("menu").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else { setMenu(prev => prev.filter(m => m.id !== id)); Swal.fire("Deleted", "Menu deleted", "success"); }
    }
  };

  // ------------------- LOADING -------------------
  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-100 dark:bg-slate-900 dark:text-slate-100">Loading...</div>;

  // ------------------- RENDER -------------------
  return (
    <div className="flex">
      {user && <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} />}
      <div className={`flex-1 min-h-screen bg-gray-100 dark:bg-slate-900 ${user && isOpen ? "ml-60" : "ml-0"}`}>
        {user && <Navbar toggleSidebar={toggleSidebar} theme={theme} toggleTheme={toggleTheme} />}
        <main className={`p-6 ${user ? "pt-16" : ""}`}>
          <Routes>
            {/* Login redirects to dashboard if already logged in */}
            <Route
              path="/"
              element={
                user ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Login setUser={setUser} />
                )
              }
            />

            <Route path="/logout" element={<Logout setUser={setUser} />} />


            {/* Protected routes */}
            <Route path="/dashboard" element={<PrivateRoute user={user} allowedFeatures={['dashboard']}><Dashboard /></PrivateRoute>} />
            <Route path="/payments" element={<PrivateRoute user={user} allowedFeatures={['payments']}><Payments inventory={inventory} setInventory={setInventory} menu={menu} user={user} /></PrivateRoute>} />
            <Route path="/history" element={<PrivateRoute user={user} allowedFeatures={['history']}><History setInventory={setInventory} /></PrivateRoute>} />
            <Route path="/menu" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin', 'chef']} allowedFeatures={['menu']}><Menu menu={menu} inventory={inventory} addMenuItem={addMenuItem} updateMenuItem={updateMenuItem} deleteMenuItem={deleteMenuItem} /></PrivateRoute>} />
            <Route path="/category" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin', 'chef']} allowedFeatures={['category']}><Category /></PrivateRoute>} />
            <Route path="/inventory" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['inventory']}><Inventory inventory={inventory} addInventoryItem={addInventoryItem} updateInventoryItem={updateInventoryItem} deleteInventoryItem={deleteInventoryItem} /></PrivateRoute>} />
            <Route path="/reports/inventory" element={<PrivateRoute user={user} allowedFeatures={['report-inventory']}><InventoryReport /></PrivateRoute>} />
            <Route path="/reports/total-sales" element={<PrivateRoute user={user} allowedFeatures={['report-total-sales']}><TotalSalesReport /></PrivateRoute>} />
            <Route path="/reports/usage" element={<PrivateRoute user={user} allowedFeatures={['report-usage']}><UsageReport /></PrivateRoute>} />
            <Route path="/reports/add-stock" element={<PrivateRoute user={user} allowedFeatures={['report-add-stock']}><AddStockReport /></PrivateRoute>} />
            <Route path="/reports/sale-usage" element={<PrivateRoute user={user} allowedFeatures={['report-sale-usage']}><SaleUsageReport /></PrivateRoute>} />
            <Route path="/reports/top-selling-menu" element={<PrivateRoute user={user} allowedFeatures={['report-total-sales']}><TopSellingMenuReport /></PrivateRoute>} />
            <Route path="/reports/profit-loss" element={<PrivateRoute user={user} allowedFeatures={['report-profit-loss']}><ProfitLossReport /></PrivateRoute>} />
            <Route path="/user-create" element={<PrivateRoute user={user} allowedRoles={['superadmin']} allowedFeatures={['user-create']}><UserCreate /></PrivateRoute>} />
            <Route path="/user-right" element={<PrivateRoute user={user} allowedRoles={['superadmin']} allowedFeatures={['user-right']}><UserRight /></PrivateRoute>} />
            <Route path="/internal-consumption" element={<PrivateRoute user={user} allowedFeatures={['internal-consumption']}><InternalConsumption inventory={inventory} setInventory={setInventory} /></PrivateRoute>} />
            <Route path="/discount-type" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['discount-type']}><DiscountType /></PrivateRoute>} />
            <Route path="/purchase" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['purchase-order']}><Purchase setInventory={setInventory} /></PrivateRoute>} />
            <Route path="/supplier" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['supplier']}><Supplier /></PrivateRoute>} />
            <Route path="/purchase-return" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['purchase-return']}><PurchaseReturn setInventory={setInventory} /></PrivateRoute>} />
            <Route path="/purchase-report" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['report-purchase']}><PurchaseReport /></PrivateRoute>} />
            <Route path="/purchase-return-report" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['report-purchase-return']}><PurchaseReturnReport /></PrivateRoute>} />
            <Route path="/reports/expired" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['report-expired']}><ExpiredReport /></PrivateRoute>} />
            <Route path="/supplier-outstanding" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['supplier-outstanding']}><SupplierOutstanding /></PrivateRoute>} />
            <Route path="/reports/supplier-outstanding" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']} allowedFeatures={['report-supplier-outstanding']}><SupplierOutstanding /></PrivateRoute>} />

            {/* Unknown paths */}
            <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
