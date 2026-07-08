import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",
  outputDirectory: ".next",
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
