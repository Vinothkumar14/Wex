export default function About() {
  return (
    <>
      <div className="kicker">Assignment note</div>
      <h1>Why a graph database?</h1>
      <p className="lede">
        A menu is a table. A kitchen is a graph. Allergen compliance and recalls are questions
        about paths — variable length, mixed types, with an explanation attached.
      </p>
      <div className="card">
        <h3>What a spreadsheet already knows</h3>
        <p className="muted">
          Dish → ingredient → allergen is a join. Every recipe card app stops there. That is why
          guests still get sick on “safe” fries: the fries never contained calamari. They shared
          Fryer A.
        </p>
        <h3>What only the graph answers cleanly</h3>
        <p className="muted">
          “If this guest cannot have molluscs, which plates are unsafe once we follow shared
          stations and equipment?” That is six hops:
        </p>
        <p>
          <code>Dish → Station → Equipment ← Station ← Dish → Ingredient → Allergen</code>
        </p>
        <p className="muted">
          In SQL you pre-declare the hop count, UNION several shapes, or write a recursive CTE
          over a polymorphic join table, then stitch the story back together in application code.
          In Cypher it is a parameterized pattern — and <code>shortestPath</code> returns the
          explanation the server can read out loud.
        </p>
        <h3>The same model for recalls</h3>
        <p className="muted">
          Lot VD-CC-4412 is cream cheese. Direct blast: Basque cheesecake. Indirect blast:
          anything mixed in the Hobart or finished on the pastry bench after that lot touched
          them — olive oil cake, pot de crème, sourdough. One graph, two products: guest safety
          and intake.
        </p>
      </div>
    </>
  );
}
