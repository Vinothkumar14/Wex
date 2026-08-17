export type Allergen = { id: string; name: string; code: string; icon: string };

export type MenuDish = {
  id: string;
  name: string;
  course: string;
  price: number;
  description: string;
  vegetarian: boolean;
  sort: number;
  allergens: { id: string; name: string; code: string }[];
  stations: { id: string; name: string }[];
};

export type GuestRow = {
  dish: {
    id: string;
    name: string;
    course: string;
    price: number;
    description: string;
    vegetarian: boolean;
  };
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

export type Lot = {
  id: string;
  code: string;
  receivedOn: string;
  status: string;
  note: string | null;
  ingredient: { id: string; name: string };
  supplier: { id: string; name: string; city: string } | null;
};

export type Blast = {
  lots: { id: string; code: string; status: string; note: string | null }[];
  directDishes: { id: string; name: string; course: string }[];
  indirectDishes: { id: string; name: string; course: string }[];
  equipment: { id: string; name: string; kind: string }[];
  suppliers: { id: string; name: string; city: string }[];
  ingredients: { id: string; name: string }[];
};

export type GraphPayload = {
  nodes: { id: string; name: string; label: string; detail: string | null }[];
  edges: { source: string; target: string; type: string }[];
};

export type PathResult = {
  hops: number;
  nodes: { id: string; name: string; labels: string[] }[];
  rels: string[];
};

export type Health =
  | {
      ok: true;
      database: string;
      empty: boolean;
      stats: { nodes: { label: string; count: number }[]; relationships: { type: string; count: number }[] };
    }
  | { ok: false; error: string; code: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the mise server.", "NETWORK", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, body.code ?? "HTTP", res.status);
  }
  return body as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  allergens: () => request<Allergen[]>("/api/allergens"),
  menu: () => request<MenuDish[]>("/api/menu"),
  dish: (id: string) => request<Record<string, unknown>>(`/api/dishes/${id}`),
  guestCheck: (allergenIds: string[]) =>
    request<GuestRow[]>("/api/guest-check", {
      method: "POST",
      body: JSON.stringify({ allergenIds }),
    }),
  lots: () => request<Lot[]>("/api/lots"),
  suppliers: () => request<{ id: string; name: string; city: string; riskLevel: string; lots: number }[]>(
    "/api/suppliers"
  ),
  recall: (q: { lotId?: string; supplierId?: string }) => {
    const p = new URLSearchParams();
    if (q.lotId) p.set("lotId", q.lotId);
    if (q.supplierId) p.set("supplierId", q.supplierId);
    return request<Blast>(`/api/recall?${p}`);
  },
  graph: () => request<GraphPayload>("/api/graph"),
  hotspots: () =>
    request<{ id: string; name: string; kind: string; note: string; dishes: string[]; lots: string[]; dishCount: number }[]>(
      "/api/hotspots"
    ),
  path: (dishId: string, allergenId: string) =>
    request<PathResult | null>(`/api/path?dishId=${encodeURIComponent(dishId)}&allergenId=${encodeURIComponent(allergenId)}`),
};
