import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  House,
  LibraryBig,
  LogOut,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { UpdateBanner } from "../context/UpdateContext";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";

export function AppShell() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    showToast("已退出登录，期待下次见。", "info");
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-frame">
      <div className="page-glow page-glow-one" aria-hidden="true" />
      <div className="page-glow page-glow-two" aria-hidden="true" />
      <header className="app-header">
        <div className="app-header-inner">
          <Logo />
          <nav className="main-nav" aria-label="主导航">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <House size={17} />
              <span>首页</span>
            </NavLink>
            <NavLink
              to="/space"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
            >
              <LibraryBig size={17} />
              <span>我的课程</span>
            </NavLink>
          </nav>
          <div className="header-actions">
            <Link className="header-settings" to="/settings">
              <Sparkles size={16} />
              <span>接入模型</span>
            </Link>
            <div className="account" ref={menuRef}>
              <button
                className={`account-trigger ${menuOpen ? "open" : ""}`}
                onClick={() => setMenuOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.displayName || "同学"} size={34} />
                <span className="account-name">{user?.displayName}</span>
                <ChevronDown size={14} className="account-chevron" />
              </button>
              {menuOpen && (
                <div className="account-menu" role="menu">
                  <div className="account-menu-head">
                    <Avatar name={user?.displayName || "同学"} size={38} />
                    <div>
                      <strong>{user?.displayName}</strong>
                      <span>
                        @{user?.username}
                        {user?.isDemo && <em className="demo-tag">演示账号</em>}
                      </span>
                    </div>
                  </div>
                  <Link to="/settings" className="account-menu-item" role="menuitem">
                    <Settings2 size={16} />
                    账号与 API 设置
                  </Link>
                  <button className="account-menu-item" onClick={handleLogout} role="menuitem">
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <UpdateBanner />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>聆记 LingJi</span>
        <span className="footer-dot">·</span>
        <span>把转瞬即逝的课堂，变成可以反复追问的知识</span>
      </footer>
    </div>
  );
}
