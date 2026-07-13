import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",
  outputDirectory: ".next",
  // Funkce v Dublinu = stejný region jako Supabase (eu-west-1) i blízko ČR.
  // Default iad1 (USA) posílal každý SSR DB dotaz přes Atlantik → cold start
  // homepage ~6 s a Safari/iCloud Private Relay stránku utínal.
  regions: ["dub1"],
  crons: [
    {
      path: "/api/maintenance/retention",
      schedule: "0 2 * * *"
    },
    {
      path: "/api/automation/morning-check",
      schedule: "30 3 * * *"
    }
  ]
};
