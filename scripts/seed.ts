import "dotenv/config";
import { closeDriver, isConfigured, verifyConnectivity, withSession } from "../server/db.js";
import {
  allergens,
  dishes,
  equipment,
  ingredients,
  lots,
  lotTouched,
  restaurant,
  staff,
  staffRuns,
  stations,
  stationUses,
  suppliers,
} from "./data.js";

async function seed() {
  if (!isConfigured()) {
    console.error("Missing NEO4J_URI / NEO4J_PASSWORD. Copy .env.example to .env first.");
    process.exit(1);
  }

  console.log("Connecting to CognoDB…");
  await verifyConnectivity();
  console.log("Connected. Loading Hearth & Tide kitchen graph…");

  await withSession(async (session) => {
    await session.run("MATCH (n) DETACH DELETE n");

    await session.run(
      `
      MERGE (r:Restaurant {id: $id})
      SET r.name = $name, r.city = $city, r.note = $note
      `,
      restaurant
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (a:Allergen {id: row.id})
      SET a.name = row.name, a.code = row.code, a.icon = row.icon
      `,
      { rows: allergens }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (s:Station {id: row.id})
      SET s.name = row.name, s.kind = row.kind
      `,
      { rows: stations }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (e:Equipment {id: row.id})
      SET e.name = row.name, e.kind = row.kind, e.note = row.note
      `,
      { rows: equipment }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MATCH (s:Station {id: row.station})
      MATCH (e:Equipment {id: row.equipment})
      MERGE (s)-[:USES]->(e)
      `,
      { rows: stationUses }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (p:Staff {id: row.id})
      SET p.name = row.name, p.role = row.role
      `,
      { rows: staff }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MATCH (p:Staff {id: row.staff})
      MATCH (s:Station {id: row.station})
      MERGE (p)-[:RUNS]->(s)
      `,
      { rows: staffRuns }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (s:Supplier {id: row.id})
      SET s.name = row.name, s.city = row.city, s.country = row.country,
          s.riskLevel = row.riskLevel, s.goods = row.goods
      `,
      { rows: suppliers }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (i:Ingredient {id: row.id})
      SET i.name = row.name, i.kind = row.kind
      WITH row, i
      MATCH (s:Supplier {id: row.supplier})
      MERGE (i)-[:SUPPLIED_BY]->(s)
      WITH row, i
      UNWIND row.allergens AS aid
      MATCH (a:Allergen {id: aid})
      MERGE (i)-[:HAS_ALLERGEN]->(a)
      `,
      { rows: ingredients }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (d:Dish {id: row.id})
      SET d.name = row.name, d.course = row.course, d.price = row.price,
          d.vegetarian = row.vegetarian, d.sort = row.sort, d.description = row.description
      WITH row, d
      MATCH (r:Restaurant {id: $rid})
      MERGE (r)-[:SERVES]->(d)
      WITH row, d
      UNWIND row.ingredients AS iid
      MATCH (i:Ingredient {id: iid})
      MERGE (d)-[:CONTAINS {amount: "as plated"}]->(i)
      WITH DISTINCT row, d
      UNWIND row.stations AS sid
      MATCH (s:Station {id: sid})
      MERGE (d)-[:PREPPED_AT]->(s)
      `,
      { rows: dishes, rid: restaurant.id }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MERGE (lot:Lot {id: row.id})
      SET lot.code = row.code, lot.receivedOn = row.receivedOn,
          lot.status = row.status, lot.note = row.note
      WITH row, lot
      MATCH (i:Ingredient {id: row.ingredient})
      MERGE (lot)-[:BATCH_OF]->(i)
      WITH row, lot
      MATCH (s:Supplier {id: row.supplier})
      MERGE (lot)-[:RECEIVED_FROM]->(s)
      `,
      { rows: lots }
    );

    await session.run(
      `
      UNWIND $rows AS row
      MATCH (lot:Lot {id: row.lot})
      MATCH (e:Equipment {id: row.equipment})
      MERGE (lot)-[:TOUCHED]->(e)
      `,
      { rows: lotTouched }
    );

    const count = await session.run(
      `
      MATCH (n)
      WITH count(n) AS nodes
      MATCH ()-[r]->()
      RETURN nodes, count(r) AS rels
      `
    );
    const rec = count.records[0];
    const nodes = rec.get("nodes");
    const rels = rec.get("rels");
    const n = typeof nodes === "object" && nodes && "toNumber" in nodes ? nodes.toNumber() : Number(nodes);
    const r = typeof rels === "object" && rels && "toNumber" in rels ? rels.toNumber() : Number(rels);
    console.log(`Seeded ${n} nodes and ${r} relationships.`);
  });

  await closeDriver();
  console.log("Done. Start the app with npm run dev");
}

seed().catch(async (err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  await closeDriver();
  process.exit(1);
});
