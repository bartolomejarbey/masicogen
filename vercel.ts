import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm --filter @masico/web build",
  installCommand: "pnpm install --frozen-lockfile",
  outputDirectory: "apps/web/.next",
  crons: [
    {
      path: "/api/maintenance/retention",
      schedule: "0 2 * * *"
    }
  ]
};
