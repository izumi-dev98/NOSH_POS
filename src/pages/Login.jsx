import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import supabase from "../createClients";
import { ROLE_ACCESS_RIGHTS } from "../utils/accessControl";
import mainLogo from "../assets/Main logo.jpg";
import restaurantBackground from "../assets/restaurant-dark-simple.jpg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSun, faMoon, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { logActivity } from "../utils/activityLogService";
import { hashPassword, verifyPassword } from "../utils/passwordService";

export default function Login({ setUser }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });
    const navigate = useNavigate();

    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark");
        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    };

    const isDarkMode = theme === "dark";

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!username.trim() || !password) {
            return Swal.fire("Error", "Please enter username and password", "error");
        }

        try {
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

            const { data, error } = await supabase
                .from("user")
                .select("*")
                .eq("username", username.trim())
                .single();

            if (error || !data) return Swal.fire("Error", "User not found", "error");
            const validPassword = data.password_hash
                ? await verifyPassword(password, data.password_hash)
                : data.password === password;
            if (!validPassword) return Swal.fire("Error", "Wrong password", "error");

            if (!data.password_hash) {
                const passwordHash = await hashPassword(password);
                await supabase
                    .from("user")
                    .update({ password_hash: passwordHash, password: null })
                    .eq("id", data.id);
                data.password_hash = passwordHash;
            }
            data.password = null;

            let permissions = ROLE_ACCESS_RIGHTS[data.role] || [];
            if (data.role !== "superadmin") {
                try {
                    const { data: rightsRows, error: rightsErr } = await supabase
                        .from("user_rights")
                        .select("function_key, is_allowed")
                        .eq("user_id", data.id);
                    if (rightsErr) throw rightsErr;
                    if (Array.isArray(rightsRows)) {
                        permissions = rightsRows
                            .filter((r) => isAllowedRow(r))
                            .map((r) => normalizeFunctionKey(r.function_key))
                            .filter(Boolean);
                    }
                } catch (rightsErr) {
                    console.warn("user_rights table not available, using role defaults", rightsErr?.message);
                }
            }

            const loginUser = { ...data, permissions };
            localStorage.setItem("user", JSON.stringify(loginUser));
            if (setUser) setUser(loginUser);
            void logActivity({
                module: "Authentication",
                action: "LOGIN",
                description: `User ${loginUser.username} logged in`,
                entityType: "user",
                entityId: loginUser.id,
            });

            Swal.fire("Success", "Logged in!", "success").then(() => {
                navigate("/dashboard");
            });
        } catch (err) {
            console.error(err);
            Swal.fire("Error", "Something went wrong", "error");
        }
    };

    const bgGradient = isDarkMode
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
        : "bg-gradient-to-br from-blue-50 via-white to-indigo-50";

    const cardClasses = isDarkMode
        ? "bg-slate-800/90 border-slate-500 shadow-slate-900/50"
        : "bg-white border-2 border-black shadow-gray-200/50";

    const titleClasses = isDarkMode ? "text-white" : "text-gray-800";
    const subtitleClasses = isDarkMode ? "text-slate-400" : "text-gray-500";
    const labelClasses = isDarkMode ? "text-slate-300" : "text-gray-600";
    const inputClasses = isDarkMode
        ? "bg-slate-700 border-slate-600 text-white placeholder-slate-400"
        : "bg-white border-gray-300 text-gray-800 placeholder-gray-400";

    return (
        <div
            className={`fixed inset-0 overflow-hidden flex items-center justify-center px-4 transition-colors duration-300 ${bgGradient}`}
            style={{
                backgroundImage: `linear-gradient(rgba(15, 23, 42, ${isDarkMode ? "0.62" : "0.42"}), rgba(15, 23, 42, ${isDarkMode ? "0.78" : "0.55"})), url("${restaurantBackground}")`,
                backgroundPosition: "center",
                backgroundSize: "cover",
            }}
        >
            <button
                onClick={toggleTheme}
                className={`absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isDarkMode
                        ? "bg-slate-700 text-yellow-400 hover:bg-slate-600"
                        : "bg-white text-slate-700 hover:bg-gray-100 shadow-md"
                }`}
                aria-label="Toggle theme"
            >
                <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="w-5 h-5" />
            </button>

            <div className={`w-full max-w-sm sm:max-w-md rounded-2xl shadow-2xl p-6 sm:p-8 border backdrop-blur-sm transition-all duration-300 ${cardClasses}`}>
                <div className="flex justify-center mb-6">
                    <img
                        src={mainLogo}
                        alt="Logo"
                        className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 shadow-lg transition-colors duration-300 ${
                            isDarkMode ? "border-slate-500" : "border-blue-500"
                        }`}
                    />
                </div>

                <div className="text-center mb-6">
                    <h1 className={`text-xl text-yellow-500 sm:text-2xl font-bold transition-colors duration-300 ${titleClasses}`}>
                        NOSH POS
                    </h1>
                    <p className={`text-xs sm:text-sm mt-1 transition-colors duration-300 ${subtitleClasses}`}>
                        Login to continue
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className={`text-xs sm:text-sm transition-colors duration-300 ${labelClasses}`}>
                            Username
                        </label>
                        <input
                            type="text"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={`mt-1 w-full px-3 sm:px-4 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300 ${inputClasses}`}
                        />
                    </div>

                    <div>
                        <label className={`text-xs sm:text-sm transition-colors duration-300 ${labelClasses}`}>
                            Password
                        </label>
                        <div className="relative mt-1">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`w-full px-3 sm:px-4 pr-11 py-2.5 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-300 ${inputClasses}`}
                            />
                            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600" aria-label={showPassword ? "Hide password" : "Show password"}>
                                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-2.5 sm:py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] transition"
                    >
                        Login
                    </button>
                </form>

                <p className="text-center text-yellow-500 text-[10px] sm:text-xs mt-6 font-semibold">
                    © March 2026 Nosh
                </p>
            </div>
        </div>
    );
}
