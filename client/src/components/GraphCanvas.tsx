import { useEffect, useMemo, useRef } from "react";
import type { GraphPayload } from "../api";

const COLORS: Record<string, string> = {
  Dish: "#c46a3a",
  Ingredient: "#efe6d6",
  Allergen: "#b5524a",
  Station: "#8fa37a",
  Equipment: "#8a9aa8",
  Lot: "#d4b06a",
  Supplier: "#6e8ca3",
  Staff: "#c9a227",
  Restaurant: "#e08a52",
};

type SimNode = GraphPayload["nodes"][number] & {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export default function GraphCanvas({
  data,
  highlight,
  onSelect,
}: {
  data: GraphPayload;
  highlight: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const highlightRef = useRef(highlight);
  const onSelectRef = useRef(onSelect);
  highlightRef.current = highlight;
  onSelectRef.current = onSelect;

  const neighborIds = useMemo(() => {
    if (!highlight) return new Set<string>();
    const s = new Set<string>([highlight]);
    for (const e of data.edges) {
      if (e.source === highlight) s.add(e.target);
      if (e.target === highlight) s.add(e.source);
    }
    return s;
  }, [data.edges, highlight]);
  const neighborRef = useRef(neighborIds);
  neighborRef.current = neighborIds;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const w = () => parent.clientWidth;
    const h = () => parent.clientHeight;
    nodesRef.current = data.nodes.map((n, i) => {
      const angle = (i / Math.max(data.nodes.length, 1)) * Math.PI * 2;
      return {
        ...n,
        x: w() / 2 + Math.cos(angle) * 180,
        y: h() / 2 + Math.sin(angle) * 140,
        vx: 0,
        vy: 0,
      };
    });

    let raf = 0;
    const tick = () => {
      const nodes = nodesRef.current;
      const width = w();
      const height = h();
      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const force = 900 / (dist * dist);
          dx /= dist;
          dy /= dist;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }

      const byId = new Map(nodes.map((n) => [n.id, n]));
      for (const e of data.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        a.vx += dx * 0.012;
        a.vy += dy * 0.012;
        b.vx -= dx * 0.012;
        b.vy -= dy * 0.012;
      }

      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.004;
        n.vy += (cy - n.y) * 0.004;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.min(width - 24, Math.max(24, n.x));
        n.y = Math.min(height - 24, Math.max(24, n.y));
      }

      ctx.clearRect(0, 0, width, height);
      const hi = highlightRef.current;
      const neigh = neighborRef.current;

      ctx.lineWidth = 1;
      for (const e of data.edges) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const active = !hi || neigh.has(e.source) && neigh.has(e.target);
        ctx.strokeStyle = active ? "rgba(196,106,58,0.35)" : "rgba(239,230,214,0.05)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of nodes) {
        const active = !hi || neigh.has(n.id);
        const r = n.label === "Dish" ? 7 : n.label === "Allergen" ? 6 : 5;
        ctx.beginPath();
        ctx.fillStyle = active ? COLORS[n.label] ?? "#efe6d6" : "rgba(239,230,214,0.12)";
        ctx.arc(n.x, n.y, hi === n.id ? r + 2 : r, 0, Math.PI * 2);
        ctx.fill();
        if (active && (n.label === "Dish" || n.label === "Equipment" || hi === n.id)) {
          ctx.fillStyle = active ? "rgba(244,238,228,0.85)" : "transparent";
          ctx.font = "11px Outfit, sans-serif";
          ctx.fillText(n.name, n.x + 8, n.y + 3);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const hit = [...nodesRef.current].reverse().find((n) => Math.hypot(n.x - x, n.y - y) < 12);
      onSelectRef.current(hit ? hit.id : null);
    };
    canvas.addEventListener("click", onClick);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", onClick);
      window.removeEventListener("resize", resize);
    };
  }, [data]);

  return <canvas ref={canvasRef} />;
}
