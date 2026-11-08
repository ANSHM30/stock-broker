"use strict";

const http = require("node:http");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const appBackendUrl = (process.env.APPBACKEND_URL || "").replace(/\/+$/, "");
const brokerApiKey = (process.env.BROKER_ADVISORY_API_KEY || "").trim();
const htmlPath = join(__dirname, "advisory-demo.html");

if (!appBackendUrl || !brokerApiKey) {
  console.error("Set APPBACKEND_URL and BROKER_ADVISORY_API_KEY before starting the demo.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (request.method === "GET" && request.url === "/api/advisories") {
    try {
      const upstream = await fetch(
        `${appBackendUrl}/api/v1/broker/advisories/indian-equities?limit=50`,
        {
          headers: { "X-Broker-API-Key": brokerApiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(15000)
        }
      );
      const body = await upstream.text();
      response.writeHead(upstream.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch (error) {
      console.error("Advisory API request failed:", error.message);
      response.writeHead(502, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify({ error: "Advisory API is temporarily unavailable" }));
    }
    return;
  }

  if (request.method === "GET" && (request.url === "/" || request.url === "/advisory-demo.html")) {
    try {
      const html = await readFile(htmlPath);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(html);
    } catch (error) {
      console.error("Could not read advisory demo page:", error.message);
      response.writeHead(500);
      response.end("Demo page could not be loaded.");
    }
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, host, () => {
  console.log(`Alvest advisory server listening on ${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(error => {
      if (error) {
        console.error("Could not close the server cleanly:", error.message);
        process.exitCode = 1;
      }
    });
  });
}
