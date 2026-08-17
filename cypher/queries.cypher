// Guest check — parameterized. $allergenIds is a list of Allergen.id values.
// Direct allergens on the recipe, then 6-hop cross-contact via shared equipment.

MATCH (d:Dish)
OPTIONAL MATCH (d)-[:CONTAINS]->(i:Ingredient)-[:HAS_ALLERGEN]->(a:Allergen)
WHERE a.id IN $allergenIds
WITH d, collect(DISTINCT CASE WHEN a IS NULL THEN NULL ELSE {
  id: a.id, name: a.name, viaIngredient: i.name
} END) AS directRaw
WITH d, [x IN directRaw WHERE x IS NOT NULL | x] AS directAllergens

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
}) AS crossContact;

// Shortest contamination path — the query a relational schema finds awkward.
// Mixed relationship types, unknown hop count, explanation included.

MATCH (d:Dish {id: $dishId}), (a:Allergen {id: $allergenId})
MATCH path = shortestPath((d)-[*1..8]-(a))
RETURN length(path) AS hops,
       [n IN nodes(path) | { id: n.id, name: coalesce(n.name, n.code, n.id), labels: labels(n) }] AS nodes,
       [r IN relationships(path) | type(r)] AS rels
LIMIT 1;

// Recall blast radius. Direct dishes plus anything that shared equipment
// the recalled lot touched.

MATCH (lot:Lot)
WHERE ($lotId IS NOT NULL AND lot.id = $lotId)
   OR ($supplierId IS NOT NULL AND (lot)-[:RECEIVED_FROM]->(:Supplier {id: $supplierId}))
OPTIONAL MATCH (lot)-[:BATCH_OF]->(i:Ingredient)<-[:CONTAINS]-(direct:Dish)
OPTIONAL MATCH (lot)-[:TOUCHED]->(e:Equipment)<-[:USES]-(st:Station)<-[:PREPPED_AT]-(indirect:Dish)
RETURN collect(DISTINCT direct { .id, .name }) AS directDishes,
       collect(DISTINCT indirect { .id, .name }) AS indirectDishes,
       collect(DISTINCT e { .id, .name }) AS equipment;
