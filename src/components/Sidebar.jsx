import { useState } from "react";
import { NavLink } from "react-router-dom";
import { hasFeature } from "../utils/accessControl";

export default function Sidebar({ isOpen }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem("user"));
  const canAccess = (feature) => hasFeature(user, feature);
  const canOpenPurchase = ["purchase", "purchase-order", "supplier", "purchase-return", "supplier-outstanding"].some(canAccess);
  const canOpenReports = [
    "report",
    "report-inventory",
    "report-total-sales",
    "report-usage",
    "report-add-stock",
    "report-purchase",
    "report-profit-loss",
    "report-supplier-outstanding",
    "report-expired",
  ].some(canAccess);

  const baseLink = "block px-4 py-2.5 rounded-lg text-sm font-medium transition-all";
  const normal = "text-slate-600 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-indigo-400 glass:text-slate-800 glass:hover:bg-white/45 glass:hover:text-indigo-800";
  const active = "bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-900/40 dark:text-indigo-300 glass:bg-white/60 glass:text-indigo-800 glass:border glass:border-white/65";

  return (
    <aside className={`fixed top-12 left-0 z-40 h-[calc(100vh-3rem)] w-60 bg-white border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700 glass:bg-white/30 glass:border-white/55 glass:backdrop-blur-3xl glass:shadow-xl transform transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <nav className="p-3 space-y-1 overflow-y-auto h-full">

        {canAccess("dashboard") && (
          <NavLink to="/dashboard" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Dashboard
          </NavLink>
        )}

        {canAccess("payments") && (
          <NavLink to="/payments" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Payments
          </NavLink>
        )}

        {canAccess("history") && (
          <NavLink to="/history" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            History
          </NavLink>
        )}

        {canAccess("menu") && (
          <NavLink to="/menu" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Menu
          </NavLink>
        )}

        {canAccess("category") && (
          <NavLink to="/category" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Category
          </NavLink>
        )}

        {canAccess("inventory") && (
          <NavLink to="/inventory" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Inventory
          </NavLink>
        )}

        {canAccess("internal-consumption") && (
          <NavLink to="/internal-consumption" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Internal Consumption
          </NavLink>
        )}

        {canAccess("discount-type") && (
          <NavLink to="/discount-type" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Discount Type
          </NavLink>
        )}

        {canOpenPurchase && (
          <div>
            <button onClick={() => setPurchaseOpen(!purchaseOpen)} className={`${baseLink} ${normal} w-full text-left flex justify-between items-center`}>
              <span>Purchase</span>
              <svg className={`w-4 h-4 transition-transform ${purchaseOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {purchaseOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-indigo-200 pl-3 dark:border-indigo-800 glass:border-white/55">
                {canAccess("purchase-order") && (
                  <NavLink to="/purchase" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Purchase Order
                  </NavLink>
                )}
                {canAccess("supplier") && (
                  <NavLink to="/supplier" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Supplier
                  </NavLink>
                )}
                {canAccess("purchase-return") && (
                  <NavLink to="/purchase-return" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Purchase Return
                  </NavLink>
                )}
                {canAccess("supplier-outstanding") && (
                  <NavLink to="/supplier-outstanding" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Supplier Outstanding
                  </NavLink>
                )}

              </div>
            )}
          </div>
        )}

        {canOpenReports && (
          <div>
            <button onClick={() => setReportOpen(!reportOpen)} className={`${baseLink} ${normal} w-full text-left flex justify-between items-center`}>
              <span>Reports</span>
              <svg className={`w-4 h-4 transition-transform ${reportOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {reportOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-indigo-200 pl-3 dark:border-indigo-800 glass:border-white/55">
                {canAccess("report-inventory") && (
                  <NavLink to="/reports/inventory" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Inventory Report
                  </NavLink>
                )}
                {canAccess("report-total-sales") && (
                  <NavLink to="/reports/total-sales" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Total Sales Report
                  </NavLink>
                )}
                {canAccess("report-total-sales") && (
                  <NavLink to="/reports/top-selling-menu" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Top Selling Menu Report
                  </NavLink>
                )}
                {canAccess("report-add-stock") && (
                  <NavLink to="/reports/add-stock" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Add Stock Report
                  </NavLink>
                )}
                {canAccess("report-usage") && (
                  <NavLink to="/reports/usage" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Internal Usage Report
                  </NavLink>
                )}
                {canAccess("report-sale-usage") && (
                  <NavLink to="/reports/sale-usage" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Sale Usage Report
                  </NavLink>
                )}
                {canAccess("report-purchase") && (
                  <NavLink to="/purchase-report" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Purchase Report
                  </NavLink>
                )}
                {canAccess("report-purchase-return") && (
                  <NavLink to="/purchase-return-report" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Purchase Return Report
                  </NavLink>
                )}
                {canAccess("report-profit-loss") && (
                  <NavLink to="/reports/profit-loss" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Profit & Loss Report
                  </NavLink>
                )}
                {canAccess("report-supplier-outstanding") && (
                  <NavLink to="/reports/supplier-outstanding" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Supplier Outstanding Report
                  </NavLink>
                )}
                {canAccess("report-expired") && (
                  <NavLink to="/reports/expired" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 glass:text-slate-700 glass:hover:text-indigo-800 glass:hover:bg-white/35"}`}>
                    Expired Report
                  </NavLink>
                )}
              </div>
            )}
          </div>
        )}

        {canAccess("user-create") && (
          <NavLink to="/user-create" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Create User
          </NavLink>
        )}

        {canAccess("user-right") && (
          <NavLink to="/user-right" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            User Right
          </NavLink>
        )}

        <NavLink to="/logout" className={`${baseLink} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30 glass:text-rose-700 glass:hover:bg-white/45`}>
          Logout
        </NavLink>

      </nav>
    </aside>
  );
}
