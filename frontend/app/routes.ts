import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  // Public routes
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("prompts", "routes/prompts.tsx"),
  route("faq", "routes/faq.tsx"),
  route("privacy-policy", "routes/privacy-policy.tsx"),
  route("tos", "routes/tos.tsx"),
  route("blog", "routes/blog/index.tsx"),
  route("account", "routes/account.tsx"),
  
  // Games routes
  route("games", "routes/games/index.tsx"),
  route("games/new", "routes/games/new.tsx"),
  route("games/:id", "routes/games/$id.tsx"),
  route("games/:id/live", "routes/games/$id.live.tsx"),
  route("games/:id/replay", "routes/games/$id.replay.tsx"),
  
  // Stats routes
  route("stats", "routes/stats/index.tsx"),
  route("stats/matchups", "routes/stats/matchups.tsx"),
  
  // Analysis routes
  route("analysis", "routes/analysis.tsx"),
  route("analysis/model/:id", "routes/analysis/model.$id.tsx"),
  
  // Admin routes
  route("admin", "routes/admin/index.tsx"),
  route("admin/login", "routes/admin/login.tsx"),
  route("admin/keys", "routes/admin/keys.tsx"),
  route("admin/batches", "routes/admin/batches/index.tsx"),
  route("admin/batches/new", "routes/admin/batches/new.tsx"),
  route("admin/batches/:id", "routes/admin/batches/$id.tsx"),
  route("admin/models", "routes/admin/models/index.tsx"),
  route("admin/games/new", "routes/admin/games/new.tsx"),
  route("admin/games/failed", "routes/admin/games/failed.tsx"),
] satisfies RouteConfig;
