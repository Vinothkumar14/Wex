import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type Blast, type Lot } from "../api";

export default function Recall() {
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [sel, setSel] = useState<string>("lot-cc");
  const [blast, setBlast] = useState<Blast | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .lots()
      .then((rows) => {
        setLots(rows);
        const recalled = rows.find((l) => l.status === "recalled");
        if (recalled) setSel(recalled.id);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load lots."));
  }, []);

  async function run(lotId = sel) {
    setBusy(true);
    setErr(null);
    try {
      setBlast(await api.recall({ lotId }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Recall query failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (lots?.length) run(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots]);

  return (
    <>
      <div className="kicker">Back of house · intake</div>
      <h1>Recall tracer</h1>
      <p className="lede">
        Valley Dairy just pulled cream-cheese lot VD-CC-4412. Direct dishes are obvious. The graph
        also finds every plate that shared the Hobart mixer or pastry bench with that lot — the
        blast radius a spreadsheet misses.
      </p>
      {err && <div className="banner warn">{err}</div>}
      <div className="grid-2">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Ingredient</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!lots && (
                <tr><td colSpan={3}><div className="skeleton" /></td></tr>
              )}
              {lots?.map((lot) => (
                <tr
                  key={lot.id}
                  className={`clickable${sel === lot.id ? " sel" : ""}`}
                  onClick={() => {
                    setSel(lot.id);
                    run(lot.id);
                  }}
                >
                  <td>
                    <div>{lot.code}</div>
                    <div className="muted">{lot.supplier?.name}</div>
                  </td>
                  <td>{lot.ingredient?.name}</td>
                  <td><span className={`badge ${lot.status}`}>{lot.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {busy && !blast && <div className="card"><div className="skeleton" /></div>}
          {blast && (
            <div className="card">
              <div className="section-label" style={{ marginTop: 0 }}>Blast radius</div>
              <div className="grid-3">
                <div className="stat"><span className="muted">Direct dishes</span><b>{blast.directDishes.length}</b></div>
                <div className="stat"><span className="muted">Via equipment</span><b>{blast.indirectDishes.length}</b></div>
                <div className="stat"><span className="muted">Surfaces</span><b>{blast.equipment.length}</b></div>
              </div>
              <div className="section-label">On the recipe</div>
              <div className="row">
                {blast.directDishes.length === 0 && <span className="muted">None</span>}
                {blast.directDishes.map((d) => (
                  <Link key={d.id} className="chip wine" to={`/dish/${d.id}`}>{d.name}</Link>
                ))}
              </div>
              <div className="section-label">Touched the same steel</div>
              <div className="row">
                {blast.indirectDishes.length === 0 && <span className="muted">None</span>}
                {blast.indirectDishes.map((d) => (
                  <Link key={d.id} className="chip gold" to={`/dish/${d.id}`}>{d.name}</Link>
                ))}
              </div>
              <div className="section-label">Equipment in the path</div>
              <div className="row">
                {blast.equipment.map((e) => (
                  <span key={e.id} className="chip">{e.name}</span>
                ))}
              </div>
              {blast.lots[0]?.note && <p className="muted" style={{ marginTop: 16 }}>{blast.lots[0].note}</p>}
              <button className="btn ghost" style={{ marginTop: 8 }} disabled={busy} onClick={() => run()}>
                Re-run blast
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
