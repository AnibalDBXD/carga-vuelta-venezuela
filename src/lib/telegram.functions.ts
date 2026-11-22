// Server fns para la UI del bot: solo exponen el username público del bot.
// Los vínculos (tokens, solicitudes) los resuelven el cliente con RLS y el
// propio bot al recibir /start.
import { createServerFn } from "@tanstack/react-start";
import { botUsername } from "./telegram";

export const getBotInfo = createServerFn({ method: "GET" }).handler(async () => {
  const username = await botUsername();
  return { username };
});
