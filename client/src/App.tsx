import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { ApiError, api, type Health } from "./api";
import Board from "./pages/Board";
import GuestCheck from "./pages/GuestCheck";
import Recall from "./pages/Recall";
import GraphPage from "./pages/GraphPage";
import DishPage from "./pages/DishPage";
import About from "./pages/About";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => {
        if (alive) {
          setHealth(h);
          setHealthErr(null);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setHealth(null);
        setHealthErr(err instanceof ApiError ? err.message : "Could not reach the API.");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <strong>mise</strong>
          <span>Hearth & Tide</span>
        </div>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            Tonight’s board
          </NavLink>
          <NavLink to="/guest" className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            Guest check
          </NavLink>
          <NavLink to="/recall" className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            Recall tracer
          </NavLink>
          <NavLink to="/graph" className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            Kitchen graph
          </NavLink>
          <NavLink to="/about" className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            Why a graph?
          </NavLink>
        </nav>
        <div className="nav-foot">
          Kitchen intelligence for allergen paths and recall blast radius.
        </div>
      </aside>
      <main className="main">
        {healthErr && (
          <div className="banner warn">
            <div>
              <strong>Database unreachable.</strong>
              <div className="muted">{healthErr} Keep the CognoDB instance running, then refresh.</div>
            </div>
          </div>
        )}
        {health && health.ok && health.empty && (
          <div className="banner warn">
            <div>
              <strong>The graph is empty.</strong>
              <div className="muted">
                From the project root run <code>npm run seed</code> to load Hearth & Tide.
              </div>
            </div>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/guest" element={<GuestCheck />} />
          <Route path="/recall" element={<Recall />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/dish/:id" element={<DishPage />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}
