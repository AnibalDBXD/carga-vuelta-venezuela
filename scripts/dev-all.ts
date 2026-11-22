// Levanta el stack completo de desarrollo con un solo comando:
//   Supabase local (db:start) + vite dev (:5173) + polling del bot de Telegram.
// Ctrl+C apaga los dos procesos hijos. Uso: `bun run dev:all`.
import { existsSync } from "fs";

// Podman en Linux: el CLI de Supabase necesita DOCKER_HOST apuntando al socket.
const uid = typeof process.getuid === "function" ? process.getuid() : null;
const podmanSock = uid != null ? `/run/user/${uid}/podman/podman.sock` : null;
if (!process.env["DOCKER_HOST"] && podmanSock && existsSync(podmanSock)) {
  process.env["DOCKER_HOST"] = `unix://${podmanSock}`;
}

if (!existsSync(".env")) {
  console.warn("[dev:all] no hay .env — copia .env.example y completa las claves");
}

// 1) Supabase local (idempotente: si ya corre, sale rápido). Las migraciones se
//    aplican solas en start; `db reset` sigue siendo manual a propósito.
console.log("[dev:all] Supabase local…");
const db = Bun.spawnSync(["bunx", "supabase", "start"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (db.exitCode !== 0) {
  console.warn("[dev:all] Supabase no arrancó (¿Docker/Podman?). La web seguirá levantando igual.");
}

// 2) vite dev + bot polling, cada uno con prefijo en su salida.
type Child = { name: string; proc: Bun.Subprocess };
const children: Child[] = [];

function spawnNamed(name: string, cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  children.push({ name, proc });
  for (const stream of [proc.stdout, proc.stderr]) {
    void (async () => {
      const reader = stream.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) console.log(`[${name}] ${line}`);
      }
      if (buf) console.log(`[${name}] ${buf}`);
    })();
  }
  return proc;
}

const web = spawnNamed("web", ["bun", "run", "dev"]);
const bot = spawnNamed("bot", ["bun", "run", "bot:dev"]);
console.log("[dev:all] web → http://localhost:5173 · bot → polling @Telegram · Ctrl+C para apagar");

const shutdown = () => {
  for (const c of children) c.proc.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Si alguno muere, avisar pero dejar vivo al otro (el bot falla sin
// TELEGRAM_BOT_TOKEN; la web no debería apagarse por eso).
for (const [name, proc] of [
  ["web", web],
  ["bot", bot],
] as const) {
  void proc.exited.then((code) => console.log(`[dev:all] ${name} terminó (código ${code})`));
}
await Promise.all([web.exited, bot.exited]);
