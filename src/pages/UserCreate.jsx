import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { hasFeature } from "../utils/accessControl";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = add, object = edit
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const currentUser = JSON.parse(localStorage.getItem("user"));
  const canAddUser = hasFeature(currentUser, "btn-user-add");
  const canEditUser = hasFeature(currentUser, "btn-user-edit");
  const canDeleteUser = hasFeature(currentUser, "btn-user-delete");

  // ------------------- FETCH USERS -------------------
  const fetchUsers = async () => {
    const { data, error } = await supabase.from("user").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setUsers(data);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // ------------------- OPEN MODAL -------------------
  const openAddModal = () => {
    setEditingUser(null);
    setFullName("");
    setUsername("");
    setPassword("");
    setRole("user");
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFullName(user.full_name);
    setUsername(user.username);
    setPassword(""); // leave blank, only fill if changing
    setRole(user.role);
    setModalOpen(true);
  };

  // ------------------- SAVE USER -------------------
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!fullName || !username || (!editingUser && !password)) {
      return Swal.fire("Error", "All fields are required", "error");
    }

    try {
      if (editingUser) {
        // UPDATE
        const updatedData = { full_name: fullName, username, role };
        if (password) updatedData.password = password;

        const { data, error } = await supabase
          .from("user")
          .update(updatedData)
          .eq("id", editingUser.id)
          .select()
          .single();

        if (error) return Swal.fire("Error", error.message, "error");

        setUsers((prev) => prev.map((u) => (u.id === data.id ? data : u)));
        Swal.fire("Success", "User updated", "success");
      } else {
        // CREATE
        const { data, error } = await supabase
          .from("user")
          .insert([{ full_name: fullName, username, password, role }])
          .select()
          .single();

        if (error) return Swal.fire("Error", error.message, "error");

        setUsers((prev) => [...prev, data]);
        Swal.fire("Success", `User ${data.username} created`, "success");
      }

      setModalOpen(false);
    } catch (err) {
      Swal.fire("Error", "Something went wrong", "error");
    }
  };

  // ------------------- DELETE USER -------------------
  const deleteUser = async (id) => {
    const result = await Swal.fire({
      title: "Delete User?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes",
    });
    if (result.isConfirmed) {
      const { error } = await supabase.from("user").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else {
        setUsers((prev) => prev.filter((u) => u.id !== id));
        Swal.fire("Deleted", "User removed", "success");
      }
    }
  };

  // ------------------- SEARCH & PAGINATION -------------------
  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // ------------------- RENDER -------------------
  return (
    <div className="p-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">User Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create and manage users</p>
        </div>
        {canAddUser && (
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add User
          </button>
        )}
      </div>

      {/* SEARCH */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6">
        <input
          type="text"
          placeholder="Search by username or name..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* USER TABLE */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-700">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">#</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Full Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Username</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Role</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Actions</th>
            </tr>
          </thead>
          <tbody>
          {paginatedUsers.map((user, idx) => (
            <tr key={user.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30">
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{user.full_name}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{user.username}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300 capitalize">{user.role}</td>
              <td className="px-4 py-3">
                {canEditUser && (
                  <button
                    onClick={() => openEditModal(user)}
                    className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                  >
                    Edit
                  </button>
                )}
                {canDeleteUser && (
                  <button
                    onClick={() => deleteUser(user.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                )}
                {!canEditUser && !canDeleteUser && (
                  <span className="text-xs text-slate-400">No Action</span>
                )}
              </td>
            </tr>
          ))}
          {paginatedUsers.length === 0 && (
            <tr>
              <td colSpan="5" className="text-center py-4 text-slate-500 dark:text-slate-400">No users found</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* PAGINATION */}
      <div className="mt-4 flex justify-center items-center space-x-2">
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1 bg-gray-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-gray-400 dark:hover:bg-slate-600">Prev</button>
        <span className="text-sm text-slate-600 dark:text-slate-300">Page {currentPage} of {totalPages}</span>
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-gray-400 dark:hover:bg-slate-600">Next</button>
      </div>
      </div>

      {/* ------------------- MODAL ------------------- */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl relative">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
              {editingUser ? "Edit User" : "Add User"}
            </h3>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="password"
                placeholder={editingUser ? "Leave blank to keep password" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required={!editingUser}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="chef">Chef</option>
                <option value="user">User</option>
              </select>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  {editingUser ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
