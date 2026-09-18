import supabase from "../createClients";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export const logActivity = async ({
  module,
  action,
  description,
  entityType = null,
  entityId = null,
  oldData = null,
  newData = null,
  metadata = {},
}) => {
  if (!module || !action || !description) return null;

  const user = getCurrentUser();
  const numericUserId = Number(user?.id);
  const { error } = await supabase
    .from("activity_logs")
    .insert({
      user_id: Number.isFinite(numericUserId) ? numericUserId : null,
      username: user?.username || null,
      user_role: user?.role || null,
      module,
      action,
      entity_type: entityType,
      entity_id: entityId == null ? null : String(entityId),
      description,
      old_data: oldData,
      new_data: newData,
      metadata,
    })

  if (error) {
    console.warn("Activity log was not saved:", error.message, error.details || "");
    return null;
  }

  return true;
};

export const logPrint = ({ module, description, entityType, entityId, metadata = {} }) =>
  logActivity({
    module,
    action: "PRINT",
    description,
    entityType,
    entityId,
    metadata: { ...metadata, print_type: metadata.print_type || "document" },
  });
