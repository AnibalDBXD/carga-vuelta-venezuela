// Servidor MCP (spec specs/003-telegram.md, fase 2): Streamable HTTP
// stateless — cada request crea su servidor/transporte; el estado del flujo
// lo lleva el cliente (el draft es un argumento más). Las herramientas del
// conductor solo se exponen con `Authorization: Bearer <token de mcp_tokens>`.
import { createFileRoute } from "@tanstack/react-router";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer, resolveMcpUser } from "@/lib/mcp-tools";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await resolveMcpUser(request).catch(() => null);
        // Stateless: el SDK exige sessionIdGenerator explícitamente en
        // undefined (con exactOptionalPropertyTypes hace falta el cast).
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined as unknown as () => string,
          enableJsonResponse: true,
        });
        const server = createMcpServer(userId);
        await server.connect(transport);
        return transport.handleRequest(request);
      },
      GET: () =>
        Response.json({
          service: "cargaruta-mcp",
          transport: "streamable-http (stateless)",
          auth: "Authorization: Bearer <token> — opcional; habilita las herramientas del conductor",
        }),
    },
  },
});
