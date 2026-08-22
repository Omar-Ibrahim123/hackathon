import { NavLink, Outlet } from "react-router-dom";

export default function AppShell() {
  return (
    <div className="page-shell app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="GreenerCart home">
          <span className="brand-mark" aria-hidden="true">G</span>
          GreenerCart
        </NavLink>
        <nav className="app-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/progress">Progress &amp; Insights</NavLink>
        </nav>
      </header>

      <Outlet />

      <footer>
        <span>GreenerCart</span>
        <span>Made for smarter grocery choices.</span>
      </footer>
    </div>
  );
}
