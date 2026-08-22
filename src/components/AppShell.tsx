import { NavLink, Outlet } from "react-router-dom";

export default function AppShell() {
  return (
    <div className="page-shell app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/" aria-label="EcoReceipt home">
          <img
            className="brand-logo"
            src="/ecoreceipt-logo.png"
            alt="EcoReceipt"
            width="400"
            height="131"
          />
        </NavLink>
        <nav className="app-nav" aria-label="Primary navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/progress">Progress &amp; Insights</NavLink>
        </nav>
      </header>

      <Outlet />

      <footer>
        <span>EcoReceipt</span>
        <span>Made for smarter grocery choices.</span>
      </footer>
    </div>
  );
}
