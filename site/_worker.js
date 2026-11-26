// Cloudflare Pages advanced-mode worker: two form endpoints, everything else is static.
const MAX = { business: 200, category: 60, area: 200, email: 254, plan: 20 };
const PLANS = new Set(["Starter", "Pro", "Premium"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function saveLead(request, env, kind) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { error: "bad_json" });
  }
  // Bots fill the hidden "website" field; pretend success and store nothing.
  if (clean(data.website, 200)) return json(200, { ok: true });

  const lead = {
    business: clean(data.business, MAX.business),
    category: clean(data.category, MAX.category),
    area: clean(data.area, MAX.area),
    email: clean(data.email, MAX.email).toLowerCase(),
    plan: PLANS.has(data.plan) ? data.plan : null,
    newsletter: data.newsletter === "on" || data.newsletter === true ? 1 : 0,
  };
  if (!lead.business || !lead.area || !EMAIL_RE.test(lead.email)) return json(422, { error: "missing_fields" });
  if (kind === "report" && !lead.category) return json(422, { error: "missing_fields" });

  await env.DB.prepare(
    "INSERT INTO leads (kind, business, category, area, email, plan, newsletter, ip_country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(kind, lead.business, lead.category || null, lead.area, lead.email, lead.plan, lead.newsletter,
          request.cf && request.cf.country ? String(request.cf.country) : null)
    .run();
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/report" || url.pathname === "/api/signup") {
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      return saveLead(request, env, url.pathname === "/api/report" ? "report" : "signup");
    }
    return env.ASSETS.fetch(request);
  },
};
