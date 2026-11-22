<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Cargo packing lives in pure TS `src/lib/packing.ts` (tested in `packing.test.ts`); the 3D viewer only draws its output — keeps the algorithm testable without WebGL.
- The 3D truck (`src/components/Truck3D.tsx`) is loaded only via `Truck3DLazy` (ClientOnly + lazy) — three.js must not run during SSR.
- Trip packages are stored as JSON on `trips.packages` so a trip can be duplicated/reversed in one read.
- Cargo layers and guided loading visibility live in pure TS `src/lib/loading-guide.ts`; presentation filters never modify the packing result or saved cargo.
- Shared return-trip links use random capability tokens and narrowly scoped database RPCs; request rows remain owner-readable only, and accepting a pending request appends its package atomically under trip/request locks to prevent duplicates.
