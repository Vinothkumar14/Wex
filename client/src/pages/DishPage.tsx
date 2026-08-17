import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";

type DishDetail = {
  id: string;
  name: string;
  course: string;
  price: number;
  description: string;
  vegetarian: boolean;
  ingredients: {
    id: string;
    name: string;
    kind: string;
    amount: string;
    allergens: { id: string; name: string }[];
    supplier: string | null;
  }[];
  stations: { id: string; name: string; kind: string }[];
  equipment: { id: string; name: string; kind: string }[];
};

export default function DishPage() {
  const { id } = useParams();
  const [dish, setDish] = useState<DishDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setDish(null);
    api
      .dish(id)
      .then((d) => setDish(d as DishDetail))
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Dish not found."));
  }, [id]);

  if (err) {
    return (
      <>
        <div className="banner warn">{err}</div>
        <Link to="/" className="btn ghost">Back to the board</Link>
      </>
    );
  }
  if (!dish) {
    return (
      <>
        <div className="skeleton" style={{ width: 240, height: 28, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: "70%", height: 48 }} />
      </>
    );
  }

  return (
    <>
      <div className="kicker">{dish.course} · ${dish.price}</div>
      <h1>{dish.name}</h1>
      <p className="lede">{dish.description}</p>
      <div className="grid-2">
        <div className="card paper">
          <div className="section-label" style={{ marginTop: 0, color: "var(--ink-soft)" }}>On the plate</div>
          {dish.ingredients.map((i) => (
            <div key={i.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(26,20,16,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{i.name}</strong>
                <span className="muted">{i.kind}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {i.allergens.map((a) => (
                  <span key={a.id} className="chip">{a.name}</span>
                ))}
                {i.supplier && <span className="chip">{i.supplier}</span>}
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="card">
            <div className="section-label" style={{ marginTop: 0 }}>Stations</div>
            <div className="row">
              {dish.stations.map((s) => (
                <span key={s.id} className="chip sage">{s.name}</span>
              ))}
            </div>
            <div className="section-label">Equipment this dish actually touches</div>
            <div className="row">
              {dish.equipment.map((e) => (
                <span key={e.id} className="chip gold">{e.name}</span>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 16 }}>
              Cross-contact is not an ingredient list. It is this dish’s path through shared
              equipment. Open Guest check and pick molluscs to see fries fail even though the
              recipe is only potato.
            </p>
            <Link to="/guest" className="btn" style={{ display: "inline-block", marginTop: 8 }}>
              Run a guest check
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
