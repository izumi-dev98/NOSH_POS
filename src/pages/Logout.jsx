import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Logout({ setUser }) { // receive setUser from App.js
  const navigate = useNavigate();

  useEffect(() => {
    // Clear localStorage
    localStorage.removeItem("user");

    // Clear App state
    if (setUser) setUser(null);

    // Redirect to login page
    navigate("/", { replace: true });
  }, [navigate, setUser]);

  return null; // No UI needed
}
