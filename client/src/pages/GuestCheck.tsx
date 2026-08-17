import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type Allergen, type GuestRow, type PathResult } from "../api";

export default function GuestCheck() {
  const [allergens, setAllergens] = useState<Allergen[]>([]);
  const [picked, setPicked] = useState<string[]>(["nuts", "molluscs"]);
  const [rows, setRows] = useState<GuestRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [path, setPath] = useState<PathResult | null>(null);

  useEffect(() => {
    api.allergens().then(setAllergens).catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load allergens."));
  }, []);

  async function run() {
    setBusy(true);
    setErr(null);
    setPath(null);
    try {
      setRows(await api.guestCheck(picked));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Guest check failed.");
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    if (!rows) return null;
    return {
      safe: rows.filter((r) => r.verdict === "safe"),
      cross: rows.filter((r) => r.verdict === "cross_contact"),
      direct: rows.filter((r) => r.verdict === "direct"),
    };
  }, [rows]);

  async function showPath(dishId: string, allergenId: string) {
    try {
      setPath(await api.path(dishId, allergenId));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not compute path.");
    }
  }

  return (
    <>
      <div className="kicker">Front of house</div>
      <h1>Guest check</h1>
      <p className="lede">
        Pick the guest’s allergens. mise walks the kitchen graph — ingredients, then shared
        equipment — and tells you what is actually safe tonight, not just what the recipe says.
      </p>
      {err && <div className="banner warn">{err}</div>}
      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>Allergens on this ticket</div>
        <div className="allergen-grid">
          {allergens.map((a) => {
            const sel = picked.includes(a.id);
            return (
              <button
                key={a.id}
                className={`allergen${sel ? " sel" : ""}`}
                onClick={() => setPicked((p) => (sel ? p.filter((x) => x !== a.id) : [...p, a.id]))}
              >
                {a.name}
              </button>
            );
          })}
        </div>
        <button className="btn" disabled={busy} onClick={run}>
          {busy ? "Walking the graph…" : "Check the board"}
        </button>
      </div>

      {grouped && grouped.safe.length + grouped.cross.length + grouped.direct.length === 0 && (
        <div className="empty" style={{ marginTop: 24 }}>No dishes in the graph yet.</div>
      )}

      {grouped && (
        <>
          <div className="grid-3" style={{ marginTop: 22 }}>
            <div className="stat"><span className="muted">Can eat</span><b>{grouped.safe.length}</b></div>
            <div className="stat"><span className="muted">Cross-contact</span><b>{grouped.cross.length}</b></div>
            <div className="stat"><span className="muted">Contains allergen</span><b>{grouped.direct.length}</b></div>
          </div>

          <div className="section-label">Safe</div>
          {grouped.safe.length === 0 && <div className="empty">Nothing is fully clear of these allergens tonight.</div>}
          <div className="cards">
            {grouped.safe.map((r) => (
              <Link key={r.dish.id} to={`/dish/${r.dish.id}`} className="card">
                <div className="verdict safe">Safe path</div>
                <h3>{r.dish.name}</h3>
                <p className="muted">{r.dish.description}</p>
              </Link>
            ))}
          </div>

          <div className="section-label">Shared steel — recipe looks fine, kitchen does not</div>
          <div className="cards">
            {grouped.cross.map((r) => {
              const hit = r.crossContact[0];
              return (
                <div key={r.dish.id} className="card">
                  <div className="verdict cross">Cross-contact · {hit?.hops ?? 6} hops</div>
                  <h3>{r.dish.name}</h3>
                  <p className="muted">
                    {hit
                      ? `${r.dish.name} is prepped at ${hit.station}, which uses ${hit.equipment} — the same equipment as ${hit.otherDish} (${hit.allergen}).`
                      : r.dish.description}
                  </p>
                  {hit && (
                    <button className="btn ghost tiny" onClick={() => showPath(r.dish.id, hit.allergenId)}>
                      Show shortest path
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="section-label">On the plate</div>
          <div className="cards">
            {grouped.direct.map((r) => (
              <div key={r.dish.id} className="card">
                <div className="verdict direct">Direct</div>
                <h3>{r.dish.name}</h3>
                <p className="muted">
                  {r.directAllergens.map((a) => `${a.name} via ${a.viaIngredient}`).join(" · ")}
                </p>
                {r.directAllergens[0] && (
                  <button className="btn ghost tiny" onClick={() => showPath(r.dish.id, r.directAllergens[0].id)}>
                    Show path
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {path && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Shortest path · {path.hops} hop{path.hops === 1 ? "" : "s"}
          </div>
          <div className="path">
            {path.nodes.map((n, i) => (
              <span key={`${n.id}-${i}`} style={{ display: "contents" }}>
                <span className="n">
                  {n.name}
                  <span className="muted"> {n.labels[0]}</span>
                </span>
                {path.rels[i] && <span className="r">{path.rels[i]}</span>}
              </span>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            A relational query for this needs a recursive CTE over several join tables, then a
            reconstruction of the explanation. Here it is one parameterized <code>shortestPath</code>.
          </p>
        </div>
      )}
    </>
  );
}
