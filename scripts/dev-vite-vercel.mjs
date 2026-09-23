import { createServer } from "vite";

const port = Number(process.env.PORT || 3000);

const server = await createServer({
  server: {
    host: "0.0.0.0",
    port,
  },
});

await server.listen();
server.printUrls();
