// layouts/Layout.jsx
import { useState } from "react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-gray-100">

      {/* Navbar */}
      <Navbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 sm:hidden"
        />
      )}

      {/* ✅ SCROLLABLE CONTENT */}
      <main
        className="
          pt-14
          h-full
          overflow-y-auto
          overflow-x-hidden
        "
      >
        {children}
      </main>

    </div>
  );
}
