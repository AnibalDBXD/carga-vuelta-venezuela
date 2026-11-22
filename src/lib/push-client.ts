// Suscripción Web Push del solicitante: corre en el navegador tras enviar la solicitud.
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Pide permiso, registra /sw.js, suscribe y guarda el endpoint ligado a la solicitud. */
export async function subscribeToRequest(requestId: string): Promise<boolean> {
  const vapidKey = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;
  if (!pushSupported() || !vapidKey) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });
  const json = subscription.toJSON();
  const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
  if (!json.endpoint || !keys?.p256dh || !keys?.auth) return false;
  const { error } = await supabase.rpc("attach_push_subscription", {
    p_request: requestId,
    p_endpoint: json.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  return !error;
}
