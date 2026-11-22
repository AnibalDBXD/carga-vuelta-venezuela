// "Conectar Telegram" del conductor: crea un token de un solo uso y abre el
// deep-link del bot; el vínculo real lo hace el bot al recibir /start drv_<id>.
// El estado "Conectado" lee telegram_chats (RLS: solo la fila propia).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBotInfo } from "@/lib/telegram.functions";
import { Button } from "@/components/ui/button";

export function ConnectTelegram() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: bot } = useQuery({
    queryKey: ["telegram-bot"],
    queryFn: () => getBotInfo(),
    staleTime: 10 * 60 * 1000,
  });
  const { data: linked } = useQuery({
    queryKey: ["telegram-link"],
    queryFn: async () => {
      const { data, error } = await supabase.from("telegram_chats").select("id").limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
  if (!bot?.username) return null;
  if (linked)
    return (
      <Button variant="ghost" disabled>
        <Check className="text-primary" /> Telegram conectado
      </Button>
    );
  const connect = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("telegram_link_tokens")
      .insert({})
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return void toast.error("No se pudo generar el enlace de conexión");
    window.open(
      `https://t.me/${bot.username}?start=drv_${data.id}`,
      "_blank",
      "noopener,noreferrer",
    );
    toast("Abre Telegram y toca «Start»: te avisaremos cuando llegue una solicitud");
    // El vínculo lo hace el bot: reintentar el estado por si el usuario lo hace ya.
    setTimeout(() => void qc.invalidateQueries({ queryKey: ["telegram-link"] }), 15_000);
  };
  return (
    <Button variant="outline" disabled={busy} onClick={connect}>
      <Send /> Conectar Telegram
    </Button>
  );
}
