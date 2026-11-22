// "API para agentes" del conductor: claves MCP (bearer tokens) para conectar
// agentes externos al servidor /api/mcp. El id de mcp_tokens ES el token; se
// gestiona client-side con RLS (solo las propias), revocar = revoked_at.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Plug, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type TokenRow = { id: string; label: string; created_at: string };

export function McpAccess() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: tokens } = useQuery({
    queryKey: ["mcp-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mcp_tokens")
        .select("id, label, created_at")
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TokenRow[];
    },
    enabled: open,
  });

  const endpoint = `${window.location.origin}/api/mcp`;

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    toast(`${what} copiado`);
  };

  const generate = async () => {
    setBusy(true);
    const { error } = await supabase.from("mcp_tokens").insert({ label: "agente" });
    setBusy(false);
    if (error) return void toast.error("No se pudo generar la clave");
    toast("Clave creada — cópiala y pégala en tu agente");
    void qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return void toast.error("No se pudo revocar");
    void qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" title="Conectar un agente externo por MCP">
          <Plug /> API
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>API para agentes (MCP)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Un agente externo (otro modelo) puede revisar tus solicitudes y aceptarlas o rechazarlas
            llamando al servidor MCP de CargaRuta. Dale el endpoint y una clave:
          </p>
          <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
            POST {endpoint}
            <br />
            Authorization: Bearer &lt;clave&gt;
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Claves activas</h3>
              <Button size="sm" variant="outline" disabled={busy} onClick={generate}>
                <Plus /> Nueva clave
              </Button>
            </div>
            {tokens?.length ? (
              <ul className="space-y-2">
                {tokens.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate" title={t.id}>
                      {t.id}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(t.created_at).toLocaleDateString("es-VE")}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0"
                      onClick={() => void copy(t.id, "Clave")}
                      title="Copiar clave"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-destructive"
                      onClick={() => void revoke(t.id)}
                      title="Revocar clave"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                No hay claves. Genera una para conectar tu agente.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
