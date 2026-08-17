import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, type MenuDish } from "../api";

const courses = ["cold", "hot", "pastry", "bread"] as const;

export default function Board() {
  const [menu, setMenu] = useState<MenuDish[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .menu()
      .then(setMenu)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Could not load the menu."));
  }, []);

  return (
    <>
      <div className="kicker">Service · 17 August</div>
      <h1>Tonight’s board</h1>
      <p className="lede">
        Hearth & Tide is a 42-seat coastal kitchen. The interesting questions are not “does this
        dish contain milk?” — they are “does this dish share steel, oil, or a mixer with something
        that does?”
      </p>
      {err && <div className="banner warn">{err}</div>}
      {!menu && !err && <div className="cards">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="card"><div className="skeleton" /></div>)}</div>}
      {menu && menu.length === 0 && <div className="empty">No dishes yet. Seed the kitchen graph first.</div>}
      {menu &&
        courses.map((course) => {
          const rows = menu.filter((d) => d.course === course);
          if (!rows.length) return null;
          return (
            <section key={course}>
              <div className="section-label">{course}</div>
              <div className="cards">
                {rows.map((d) => (
                  <Link key={d.id} to={`/dish/${d.id}`} className="card paper">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="price">${d.price}</span>
                      {d.vegetarian && <span className="chip sage">veg</span>}
                    </div>
                    <h3>{d.name}</h3>
                    <p className="muted" style={{ minHeight: 44 }}>{d.description}</p>
                    <div className="row">
                      {d.allergens.map((a) => (
                        <span key={a.id} className="chip">{a.name}</span>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                      {d.stations.map((s) => (
                        <span key={s.id} className="chip">{s.name}</span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
    </>
  );
}
