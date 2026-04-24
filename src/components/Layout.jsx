import {
  BarChart3,
  CalendarDays,
  Compass,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  ReceiptText,
  Target,
  TrendingUp,
  User,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { logout } from "../services/authService";
import { useAuth } from "../context/AuthContext";

const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["transactions", "Transactions", ReceiptText],
  ["categories", "Categories", WalletCards],
  ["wishlist", "Wishlist", Heart],
  ["targets", "Targets", Target],
  ["analytics", "Analytics", BarChart3],
  ["summaries", "Summaries", CalendarDays],
  ["stocks", "Stocks", TrendingUp],
  ["profile", "Profile", User],
  ["discover", "Discover", Compass],
  ["feed", "Feed", Users],
];

const BUILD_VERSION = typeof __AVEN_BUILD_VERSION__ !== "undefined" ? __AVEN_BUILD_VERSION__ : "dev";
const BUILD_STAMP = typeof __AVEN_BUILD_STAMP__ !== "undefined" ? __AVEN_BUILD_STAMP__ : "local";

export function Layout({ active, setActive, children }) {
  const { profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (!mobileOpen) return;
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) {
        setMobileOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") setMobileOpen(false);
    }

    document.addEventListener("pointerdown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen]);

  function chooseSection(key) {
    setActive(key);
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Aven Social Ledger</p>
          <h1>Track your money, protect your privacy, simply with Aven</h1>
          <p className="build-marker">Build {BUILD_VERSION} • {BUILD_STAMP}</p>
        </div>
        <div className="top-profile">
          <div className="avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <PiggyBank size={24} />}</div>
          <div>
            <strong>{profile?.display_name || "Aven"}</strong>
            <span>@{profile?.username || "profile"}</span>
          </div>
          <button className="icon-button" type="button" onClick={logout} aria-label="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <nav className="tabbar desktop-nav" aria-label="Aven sections">
        {nav.map(([key, label, Icon]) => (
          <button key={key} className={`tab-button ${active === key ? "active" : ""}`} type="button" onClick={() => chooseSection(key)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mobile-nav-wrap" ref={mobileNavRef}>
        <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-expanded={mobileOpen} aria-controls="mobile-nav">
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          Menu
        </button>
        <nav id="mobile-nav" className={`mobile-nav ${mobileOpen ? "open" : ""}`} aria-label="Mobile Aven sections">
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={`mobile-nav-item ${active === key ? "active" : ""}`} type="button" onClick={() => chooseSection(key)}>
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main>{children}</main>
    </div>
  );
}
