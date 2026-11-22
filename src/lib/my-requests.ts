// Solicitudes del cliente en este dispositivo: los request ids son capabilities
// (UUID inadivinables) que el solicitante ya posee, así que guardarlos en
// localStorage no expone nada nuevo — solo evita que pierda sus enlaces de pago.
const KEY = "cargaruta:requests";
const MAX = 50;

export function readMyRequests(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)));
  } catch {
    // Storage lleno o bloqueado: la página de pago igual funciona con el enlace.
  }
}

/** Registra el id al enviar la solicitud y al abrir cualquier /pagos/<id>. */
export function rememberRequest(id: string) {
  if (typeof window === "undefined") return;
  write([id, ...readMyRequests().filter((r) => r !== id)]);
}

/** Quita el id de la lista (solicitudes terminales que el cliente descarta). */
export function forgetRequest(id: string) {
  if (typeof window === "undefined") return;
  write(readMyRequests().filter((r) => r !== id));
}
