import { createServer } from "node:http";
import next from "next";
import { migrate } from "./src/server/db";
import { attachRealtime } from "./src/server/realtime/socket";

// One process serves Next.js pages/API routes and the Socket.IO endpoint.
const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

await migrate();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((req, res) => handle(req, res));
attachRealtime(server);

server.listen(port, hostname, () => {
  console.log(`▲ LinkUp ready on http://localhost:${port}  (${dev ? "dev" : "prod"})`);
  console.log(`  Restaurants: ${process.env.GOOGLE_PLACES_API_KEY ? "Google Places" : "demo data (set GOOGLE_PLACES_API_KEY for real places)"}`);
  console.log(`  AI wishes:   ${process.env.ANTHROPIC_API_KEY ? `Claude (${process.env.ANTHROPIC_MODEL || "claude-haiku-4-5"})` : "keyword matching only (set ANTHROPIC_API_KEY to use Claude)"}`);
});
