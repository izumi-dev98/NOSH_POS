import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { FUNCTION_OPTIONS, ROLE_ACCESS_RIGHTS } from "../utils/accessControl";

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
        .select("id, full_name, username, role")
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
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    Save Rights
                  </button>
                </div>

                {Object.entries(groupedFunctions).map(([groupName, items]) => (
                  <div key={groupName} className="mb-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">{groupName}</h3>
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
