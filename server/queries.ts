import type { Session } from "neo4j-driver";
import { int } from "neo4j-driver";

function rec(r: { get: (k: string) => unknown }) {
  return {
    get<T>(key: string): T {
      return r.get(key) as T;
    },
  };
}

export async function ping(session: Session): Promise<boolean> {
  const res = await session.run("RETURN 1 AS ok");
  return res.records[0]?.get("ok") === int(1) || res.records[0]?.get("ok") === 1;
}

export async function graphStats(session: Session) {
  const res = await session.run(
    `
    MATCH (n)
    WITH labels(n)[0] AS label, count(*) AS n
    RETURN collect({label: label, count: n}) AS nodes
    `
  );
  const rel = await session.run(
    `
    MATCH ()-[r]->()
    WITH type(r) AS type, count(*) AS n
    RETURN collect({type: type, count: n}) AS rels
    `
  );
  return {
    nodes: rec(res.records[0]).get<{ label: string; count: { toNumber?: () => number } | number }[]>(
      "nodes"
    ).map((x) => ({ label: x.label, count: toNum(x.count) })),
    relationships: rec(rel.records[0]).get<{ type: string; count: { toNumber?: () => number } | number }[]>(
      "rels"
    ).map((x) => ({ type: x.type, count: toNum(x.count) })),
  };
}

export async function listAllergens(session: Session) {
  const res = await session.run(
    `
    MATCH (a:Allergen)
    RETURN a.id AS id, a.name AS name, a.code AS code, a.icon AS icon
    ORDER BY a.name
    `
  );
  return res.records.map((r) => ({
    id: r.get("id") as string,
    name: r.get("name") as string,
    code: r.get("code") as string,
    icon: r.get("icon") as string,
  }));
}

export async function listMenu(session: Session) {
  const res = await session.run(
    `
    MATCH (d:Dish)
    OPTIONAL MATCH (d)-[:CONTAINS]->(i:Ingredient)-[:HAS_ALLERGEN]->(a:Allergen)
    OPTIONAL MATCH (d)-[:PREPPED_AT]->(s:Station)
    WITH d,
         collect(DISTINCT {id: a.id, name: a.name, code: a.code}) AS allergens,
         collect(DISTINCT {id: s.id, name: s.name}) AS stations
    RETURN d {
      .id, .name, .course, .price, .description, .vegetarian, .sort
    } AS dish,
    [x IN allergens WHERE x.id IS NOT NULL | x] AS allergens,
    [x IN stations WHERE x.id IS NOT NULL | x] AS stations
    ORDER BY d.sort
    `
  );
  return res.records.map((r) => ({
    ...(r.get("dish") as Record<string, unknown>),
    allergens: r.get("allergens"),
    stations: r.get("stations"),
  }));
}

export async function getDish(session: Session, id: string) {
  const res = await session.run(
    `
    MATCH (d:Dish {id: $id})
    OPTIONAL MATCH (d)-[c:CONTAINS]->(i:Ingredient)
    OPTIONAL MATCH (i)-[:HAS_ALLERGEN]->(a:Allergen)
    OPTIONAL MATCH (i)-[:SUPPLIED_BY]->(sup:Supplier)
    OPTIONAL MATCH (d)-[:PREPPED_AT]->(s:Station)-[:USES]->(e:Equipment)
    WITH d,
         collect(DISTINCT {
           id: i.id, name: i.name, kind: i.kind,
           amount: c.amount,
           allergens: [(i)-[:HAS_ALLERGEN]->(aa) | {id: aa.id, name: aa.name}],
           supplier: sup.name
         }) AS ingredients,
         collect(DISTINCT {id: s.id, name: s.name, kind: s.kind}) AS stations,
         collect(DISTINCT {id: e.id, name: e.name, kind: e.kind}) AS equipment
    RETURN d { .id, .name, .course, .price, .description, .vegetarian } AS dish,
           [x IN ingredients WHERE x.id IS NOT NULL | x] AS ingredients,
           [x IN stations WHERE x.id IS NOT NULL | x] AS stations,
           [x IN equipment WHERE x.id IS NOT NULL | x] AS equipment
    `,
    { id }
  );
  if (!res.records[0]) return null;
  const r = res.records[0];
  return {
    ...(r.get("dish") as object),
    ingredients: r.get("ingredients"),
    stations: r.get("stations"),
    equipment: r.get("equipment"),
  };
}

export type GuestCheck = {
  dish: Record<string, unknown>;
  verdict: "safe" | "direct" | "cross_contact";
  directAllergens: { id: string; name: string; viaIngredient: string }[];
  crossContact: {
    allergenId: string;
    allergen: string;
    equipment: string;
    otherDish: string;
    station: string;
    hops: number;
  }[];
};

/**
 * Guest allergen check.
 * Direct: Dish -CONTAINS-> Ingredient -HAS_ALLERGEN-> Allergen
 * Cross-contact: Dish -PREPPED_AT-> Station -USES-> Equipment,
 * then a second MATCH (so the same USES edge can be reused) to other dishes
 * on that equipment, then on to their allergens.
 */
export async function guestCheck(session: Session, allergenIds: string[]): Promise<GuestCheck[]> {
  const dishesRes = await session.run(
    `
    MATCH (d:Dish)
    OPTIONAL MATCH (d)-[:CONTAINS]->(i:Ingredient)-[:HAS_ALLERGEN]->(a:Allergen)
    WHERE a.id IN $allergenIds
    WITH d, collect(DISTINCT CASE WHEN a IS NULL THEN NULL ELSE {
      id: a.id, name: a.name, viaIngredient: i.name
    } END) AS directRaw
    RETURN d { .id, .name, .course, .price, .description, .vegetarian, .sort } AS dish,
           [x IN directRaw WHERE x IS NOT NULL | x] AS directAllergens
    ORDER BY d.sort
    `,
    { allergenIds }
  );

  const crossRes = await session.run(
    `
    MATCH (d:Dish)-[:PREPPED_AT]->(s:Station)-[:USES]->(e:Equipment)
    WITH d, s, e
    MATCH (other:Dish)-[:PREPPED_AT]->(s2:Station)-[:USES]->(e)
    WHERE other <> d
    MATCH (other)-[:CONTAINS]->(:Ingredient)-[:HAS_ALLERGEN]->(ca:Allergen)
    WHERE ca.id IN $allergenIds
      AND NOT (d)-[:CONTAINS]->(:Ingredient)-[:HAS_ALLERGEN]->(ca)
    RETURN d.id AS dishId, collect(DISTINCT {
      allergenId: ca.id,
      allergen: ca.name,
      equipment: e.name,
      otherDish: other.name,
      station: s.name,
      hops: 6
    }) AS crossContact
    `,
    { allergenIds }
  );

  const crossByDish = new Map<string, GuestCheck["crossContact"]>();
  for (const rec of crossRes.records) {
    const rows = (rec.get("crossContact") as GuestCheck["crossContact"]).map((c) => ({
      ...c,
      hops: toNum(c.hops),
    }));
    crossByDish.set(rec.get("dishId") as string, rows);
  }

  return dishesRes.records.map((r) => {
    const dish = r.get("dish") as Record<string, unknown>;
    const directAllergens = (r.get("directAllergens") ?? []) as GuestCheck["directAllergens"];
    const crossContact = crossByDish.get(dish.id as string) ?? [];
    const verdict: GuestCheck["verdict"] =
      directAllergens.length > 0 ? "direct" : crossContact.length > 0 ? "cross_contact" : "safe";
    return { dish, verdict, directAllergens, crossContact };
  });
}

/**
 * Variable-length shortest path between a dish and an allergen.
 * This is the query a relational schema handles poorly: mixed relationship
 * types, unknown hop count, and an explanation of *why* the two are connected.
 */
export async function contaminationPath(session: Session, dishId: string, allergenId: string) {
  const res = await session.run(
    `
    MATCH (d:Dish {id: $dishId}), (a:Allergen {id: $allergenId})
    MATCH path = shortestPath((d)-[*1..8]-(a))
    WITH path, length(path) AS hops
    RETURN hops,
           [n IN nodes(path) | {
             id: n.id,
             name: coalesce(n.name, n.code, n.id),
             labels: labels(n)
           }] AS nodes,
           [r IN relationships(path) | type(r)] AS rels
    LIMIT 1
    `,
    { dishId, allergenId }
  );
  if (!res.records[0]) return null;
  const r = res.records[0];
  return {
    hops: toNum(r.get("hops")),
    nodes: r.get("nodes"),
    rels: r.get("rels"),
  };
}

export async function listLots(session: Session) {
  const res = await session.run(
    `
    MATCH (lot:Lot)-[:BATCH_OF]->(i:Ingredient)
    OPTIONAL MATCH (lot)-[:RECEIVED_FROM]->(s:Supplier)
    RETURN lot { .id, .code, .receivedOn, .status, .note } AS lot,
           i { .id, .name } AS ingredient,
           s { .id, .name, .city } AS supplier
    ORDER BY lot.receivedOn DESC
    `
  );
  return res.records.map((r) => ({
    ...(r.get("lot") as object),
    ingredient: r.get("ingredient"),
    supplier: r.get("supplier"),
  }));
}

export async function listSuppliers(session: Session) {
  const res = await session.run(
    `
    MATCH (s:Supplier)
    OPTIONAL MATCH (s)<-[:RECEIVED_FROM]-(lot:Lot)
    RETURN s { .id, .name, .city, .country, .riskLevel, .goods } AS supplier,
           count(lot) AS lots
    ORDER BY s.name
    `
  );
  return res.records.map((r) => ({
    ...(r.get("supplier") as object),
    lots: toNum(r.get("lots")),
  }));
}

/**
 * Recall blast radius.
 * Direct: Lot -BATCH_OF-> Ingredient <-CONTAINS- Dish
 * Indirect (2–4 hops): Lot -TOUCHED-> Equipment <-USES- Station <-PREPPED_AT- Dish
 * Sibling lots from the same supplier are also surfaced.
 */
export async function recallBlast(session: Session, params: { lotId?: string; supplierId?: string }) {
  const res = await session.run(
    `
    MATCH (lot:Lot)
    WHERE ($lotId IS NOT NULL AND lot.id = $lotId)
       OR ($supplierId IS NOT NULL AND (lot)-[:RECEIVED_FROM]->(:Supplier {id: $supplierId}))
    OPTIONAL MATCH (lot)-[:BATCH_OF]->(i:Ingredient)<-[:CONTAINS]-(direct:Dish)
    OPTIONAL MATCH (lot)-[:TOUCHED]->(e:Equipment)<-[:USES]-(st:Station)<-[:PREPPED_AT]-(indirect:Dish)
    OPTIONAL MATCH (lot)-[:RECEIVED_FROM]->(sup:Supplier)
    OPTIONAL MATCH (lot)-[:BATCH_OF]->(ing:Ingredient)
    WITH collect(DISTINCT lot { .id, .code, .status, .note, .receivedOn }) AS lots,
         collect(DISTINCT direct { .id, .name, .course }) AS directDishes,
         collect(DISTINCT indirect { .id, .name, .course }) AS indirectDishes,
         collect(DISTINCT e { .id, .name, .kind }) AS equipment,
         collect(DISTINCT sup { .id, .name, .city }) AS suppliers,
         collect(DISTINCT ing { .id, .name }) AS ingredients
    RETURN
      [x IN lots WHERE x.id IS NOT NULL | x] AS lots,
      [x IN directDishes WHERE x.id IS NOT NULL | x] AS directDishes,
      [x IN indirectDishes WHERE x.id IS NOT NULL | x] AS indirectDishes,
      [x IN equipment WHERE x.id IS NOT NULL | x] AS equipment,
      [x IN suppliers WHERE x.id IS NOT NULL | x] AS suppliers,
      [x IN ingredients WHERE x.id IS NOT NULL | x] AS ingredients
    `,
    { lotId: params.lotId ?? null, supplierId: params.supplierId ?? null }
  );
  const r = res.records[0];
  if (!r) {
    return { lots: [], directDishes: [], indirectDishes: [], equipment: [], suppliers: [], ingredients: [] };
  }
  const directDishes = (r.get("directDishes") ?? []) as { id: string }[];
  const indirectDishes = ((r.get("indirectDishes") ?? []) as { id: string }[]).filter(
    (d) => !directDishes.some((x) => x.id === d.id)
  );
  return {
    lots: r.get("lots"),
    directDishes,
    indirectDishes,
    equipment: r.get("equipment"),
    suppliers: r.get("suppliers"),
    ingredients: r.get("ingredients"),
  };
}

export async function graphPayload(session: Session) {
  const nodes = await session.run(
    `
    MATCH (n)
    WHERE n:Dish OR n:Ingredient OR n:Allergen OR n:Station
       OR n:Equipment OR n:Supplier OR n:Lot OR n:Staff
    RETURN n.id AS id,
           coalesce(n.name, n.code, n.id) AS name,
           labels(n)[0] AS label,
           coalesce(n.course, n.kind, n.status, n.role, n.riskLevel) AS detail
    `
  );
  const edges = await session.run(
    `
    MATCH (a)-[r]->(b)
    WHERE a.id IS NOT NULL AND b.id IS NOT NULL
    RETURN a.id AS source, b.id AS target, type(r) AS type
    `
  );
  return {
    nodes: nodes.records.map((r) => ({
      id: r.get("id") as string,
      name: r.get("name") as string,
      label: r.get("label") as string,
      detail: r.get("detail") as string | null,
    })),
    edges: edges.records.map((r) => ({
      source: r.get("source") as string,
      target: r.get("target") as string,
      type: r.get("type") as string,
    })),
  };
}

export async function hotspotEquipment(session: Session) {
  const res = await session.run(
    `
    MATCH (e:Equipment)
    OPTIONAL MATCH (d:Dish)-[:PREPPED_AT]->(:Station)-[:USES]->(e)
    OPTIONAL MATCH (lot:Lot)-[:TOUCHED]->(e)
    WITH e,
         collect(DISTINCT d.name) AS dishes,
         collect(DISTINCT lot.code) AS lots
    RETURN e { .id, .name, .kind, .note } AS equipment,
           [x IN dishes WHERE x IS NOT NULL | x] AS dishes,
           [x IN lots WHERE x IS NOT NULL | x] AS lots,
           size([x IN dishes WHERE x IS NOT NULL | x]) AS dishCount
    ORDER BY dishCount DESC, e.name
    `
  );
  return res.records.map((r) => ({
    ...(r.get("equipment") as object),
    dishes: r.get("dishes"),
    lots: r.get("lots"),
    dishCount: toNum(r.get("dishCount")),
  }));
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v ?? 0);
}
