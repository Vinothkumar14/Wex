import { useEffect, useState } from "react";
import { ApiError, api, type GraphPayload } from "../api";
import GraphCanvas from "../components/GraphCanvas";

const labels = ["Dish", "Ingredient", "Allergen", "Station", "Equipment", "Lot", "Supplier", "Staff"];

export default function GraphPage() {
  const [data, setData] = useState<GraphPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [hotspots, setHotspots] = useState<{ id: string; name: string; note: string; dishes: string[]; dishCount: number }[]>([]);

  useEffect(() => {
    Promise.all([api.graph(), api.hotspots()])
      .then(([g, h]) => {
        setData(g);
        setHotspots(h);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load the graph."));
  }, []);

  const filtered = data
    ? {
        nodes: data.nodes.filter((n) => !hidden.includes(n.label)),
        edges: data.edges.filter((e) => {
          const labelsById = Object.fromEntries(data.nodes.map((n) => [n.id, n.label]));
          return !hidden.includes(labelsById[e.source]) && !hidden.includes(labelsById[e.target]);
        }),
      }
    : null;

  const selected = data?.nodes.find((n) => n.id === sel);

  return (
    <>
      <div className="kicker">Model</div>
      <h1>Kitchen graph</h1>
      <p className="lede">
        Every plate, lot, mixer, and allergen in tonight’s service. Click a node to pin its
        neighborhood. The list on the right is equipment ranked by how many dishes it touches —
        the kitchen’s cut vertices.
      </p>
      {err && <div className="banner warn">{err}</div>}
      <div className="legend">
        {labels.map((l) => (
          <button
            key={l}
            className={`chip${hidden.includes(l) ? "" : " on"}`}
            onClick={() => setHidden((h) => (h.includes(l) ? h.filter((x) => x !== l) : [...h, l]))}
          >
            {l}
          </button>
        ))}
      </div>
      {!filtered && !err && <div className="graph-wrap"><div className="skeleton" style={{ height: "100%" }} /></div>}
      {filtered && filtered.nodes.length === 0 && <div className="empty">No nodes to show. Seed the database or toggle labels back on.</div>}
      {filtered && filtered.nodes.length > 0 && (
        <div className="grid-2">
          <div className="graph-wrap">
            <GraphCanvas data={filtered} highlight={sel} onSelect={setSel} />
          </div>
          <div>
            <div className="card">
              <div className="section-label" style={{ marginTop: 0 }}>Selected</div>
              {selected ? (
                <>
                  <h3>{selected.name}</h3>
                  <div className="row">
                    <span className="chip on">{selected.label}</span>
                    {selected.detail && <span className="chip">{selected.detail}</span>}
                  </div>
                </>
              ) : (
                <p className="muted">Click a node in the constellation.</p>
              )}
            </div>
            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-label" style={{ marginTop: 0 }}>Shared-steel hotspots</div>
              {hotspots.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSel(h.id)}
                  style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, padding: "10px 0", cursor: "pointer", borderBottom: "1px solid var(--line)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{h.name}</strong>
                    <span className="muted">{h.dishCount} dishes</span>
                  </div>
                  <div className="muted">{h.note}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
