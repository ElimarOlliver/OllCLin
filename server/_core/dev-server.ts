import { createServer } from "http";
import { createApp } from "./index";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = await createApp();
  const server = createServer(app);
  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");

  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
