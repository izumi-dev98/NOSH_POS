import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { FUNCTION_OPTIONS, ROLE_ACCESS_RIGHTS } from "../utils/accessControl";
import { logActivity } from "../utils/activityLogService";

export default function UserRight() {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedRights, setSelectedRights] = useState([]);
  const [rightsByUser, setRightsByUser] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const getDefaultRightsForUser = (user) => ROLE_ACCESS_RIGHTS[user?.role] || [];
  const allowedFunctionKeys = useMemo(
    () => new Set(FUNCTION_OPTIONS.map((opt) => opt.key)),
    []
  );

  const isAllowedRow = (row) => {
    if (row?.is_allowed === undefined || row?.is_allowed === null) return true;
    if (typeof row.is_allowed === "string") {
      const value = row.is_allowed.trim().toLowerCase();
      return value === "true" || value === "1" || value === "t" || value === "yes";
    }
    return Boolean(row.is_allowed);
  };

  const normalizeFunctionKey = (value) => {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase().replace(/_/g, "-");
  };

  const resolveUserRights = (user, mappedRights) => {
    if (!user) return [];
    if (user.role === "superadmin") return ROLE_ACCESS_RIGHTS.superadmin;
    if (Object.prototype.hasOwnProperty.call(mappedRights, user.id)) {
      return mappedRights[user.id];
    }
    return getDefaultRightsForUser(user);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: usersData, error: usersErr } = await supabase
        .from("user")
        .select("id, full_name, username, role, department, position")
        .order("id", { ascending: true });

      if (usersErr) throw usersErr;

      let mapped = {};
      try {
        const { data: rightsData, error: rightsErr } = await supabase
          .from("user_rights")
          .select("user_id, function_key, is_allowed");
        if (rightsErr) throw rightsErr;

        (rightsData || []).forEach((row) => {
          if (!isAllowedRow(row)) return;
          const normalizedKey = normalizeFunctionKey(row.function_key);
          if (!normalizedKey || !allowedFunctionKeys.has(normalizedKey)) return;
          if (!mapped[row.user_id]) mapped[row.user_id] = [];
          mapped[row.user_id].push(normalizedKey);
        });

        Object.keys(mapped).forEach((userId) => {
          mapped[userId] = Array.from(new Set(mapped[userId]));
        });
      } catch (rightsErr) {
        console.warn("user_rights table unavailable, fallback to role defaults", rightsErr?.message);
      }

      setUsers(usersData || []);
      setRightsByUser(mapped);

      const firstUser = (usersData || [])[0];
      if (firstUser) {
        setSelectedUserId(firstUser.id);
        setSelectedRights(resolveUserRights(firstUser, mapped));
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message || "Failed to load user rights", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(q) ||
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q)
    );
  });

  const groupedFunctions = useMemo(() => {
    return FUNCTION_OPTIONS.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const onSelectUser = (user) => {
    setSelectedUserId(user.id);
    setSelectedRights(resolveUserRights(user, rightsByUser));
  };

  const toggleRight = (functionKey) => {
    if (selectedUser?.role === "superadmin") return;
    setSelectedRights((prev) =>
      prev.includes(functionKey)
        ? prev.filter((k) => k !== functionKey)
        : [...prev, functionKey]
    );
  };

  const toggleGroup = (items) => {
    if (selectedUser?.role === "superadmin") return;
    const groupKeys = items.map((item) => item.key);
    const allSelected = groupKeys.every((key) => selectedRights.includes(key));
    setSelectedRights((prev) => allSelected
      ? prev.filter((key) => !groupKeys.includes(key))
      : Array.from(new Set([...prev, ...groupKeys])));
  };

  const selectAllRights = () => {
    if (selectedUser?.role === "superadmin") return;
    setSelectedRights(FUNCTION_OPTIONS.map((option) => option.key));
  };

  const clearAllRights = () => {
    if (selectedUser?.role === "superadmin") return;
    setSelectedRights([]);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    try {
      const userId = selectedUser.id;

      await supabase.from("user_rights").delete().eq("user_id", userId);

      if (selectedUser.role !== "superadmin" && selectedRights.length > 0) {
        const insertRows = selectedRights.map((functionKey) => ({
          user_id: userId,
          function_key: functionKey,
          is_allowed: true,
        }));
        const { error: insertErr } = await supabase.from("user_rights").insert(insertRows);
        if (insertErr) throw insertErr;
      }

      const rightsForUser =
        selectedUser.role === "superadmin" ? ROLE_ACCESS_RIGHTS.superadmin : selectedRights;
      setRightsByUser((prev) => ({ ...prev, [userId]: rightsForUser }));

      void logActivity({
        module: "User Rights",
        action: "UPDATE",
        description: `Updated permissions for ${selectedUser.username}`,
        entityType: "user_rights",
        entityId: userId,
        newData: { permissions: rightsForUser },
      });

      const localUser = JSON.parse(localStorage.getItem("user") || "null");
      if (localUser?.id === userId) {
        localStorage.setItem(
          "user",
          JSON.stringify({ ...localUser, permissions: rightsForUser })
        );
      }

      Swal.fire("Success", selectedUser.role === "superadmin" ? "Superadmin keeps full default rights" : "User rights saved", "success");
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Error",
        err.message || "Failed to save user rights. Please ensure user_rights table exists in Supabase.",
        "error"
      );
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">User Right</h1>
        <p className="text-sm text-slate-500 mt-1">Select user and manage function access</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 lg:col-span-1">
            <input
              type="text"
              placeholder="Search user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />

            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onSelectUser(u)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${
                    selectedUserId === u.id
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold">{u.full_name || "-"}</div>
                  <div className="text-xs text-slate-500">@{u.username} • {u.role}</div>
                  <div className="text-xs text-slate-400">{u.department || "-"} • {u.position || "-"}</div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-8">No users found</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 lg:col-span-2">
            {!selectedUser ? (
              <div className="text-sm text-slate-500 text-center py-20">Select a user from the left list</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                      {selectedUser.full_name} ({selectedUser.username})
                    </h2>
                    <p className="text-sm text-slate-500 capitalize">Role: {selectedUser.role}</p>
                    {selectedUser.role === "superadmin" && (
                      <p className="text-xs text-amber-600 mt-1">
                        Superadmin rights are fixed and cannot be edited.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={selectAllRights} disabled={selectedUser.role === "superadmin"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Select All</button>
                    <button onClick={clearAllRights} disabled={selectedUser.role === "superadmin"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Clear All</button>
                    <button onClick={handleSave} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save Rights</button>
                  </div>
                </div>

                {Object.entries(groupedFunctions).map(([groupName, items]) => (
                  <div key={groupName} className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">{groupName}</h3>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={items.every((item) => selectedRights.includes(item.key))}
                          onChange={() => toggleGroup(items)}
                          disabled={selectedUser.role === "superadmin"}
                          className="h-4 w-4"
                        />
                        Select group
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {items.map((fn) => (
                        <label
                          key={fn.key}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRights.includes(fn.key)}
                            onChange={() => toggleRight(fn.key)}
                            disabled={selectedUser.role === "superadmin"}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-slate-700">{fn.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
