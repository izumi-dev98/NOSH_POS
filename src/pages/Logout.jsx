import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logActivity } from "../utils/activityLogService";

export default function Logout({ setUser }) { // receive setUser from App.js
  const navigate = useNavigate();

  useEffect(() => {
    void logActivity({
      module: "Authentication",
      action: "LOGOUT",
      description: "User logged out",
      entityType: "user",
    });

    // Clear localStorage
    localStorage.removeItem("user");

    // Clear App state
    if (setUser) setUser(null);

    // Redirect to login page
    navigate("/", { replace: true });
  }, [navigate, setUser]);

  return null; // No UI needed
}
