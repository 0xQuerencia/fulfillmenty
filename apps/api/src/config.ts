import "dotenv/config";
import { z } from "zod";

const developmentApiKeyPepper = "local-development-pepper-change-before-deploy";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("debug"),
  DATABASE_URL: z.string().min(1).default("postgres://fulfillmenty:fulfillmenty_dev_only@127.0.0.1:5432/fulfillmenty"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  FULFILLMENTY_LOCAL_DEMO: z.string().default("true"),
  FULFILLMENTY_API_KEY_PEPPER: z.string().min(16).optional(),
}).superRefine((environment, context) => {
  if (environment.NODE_ENV !== "production") return;

  const pepper = environment.FULFILLMENTY_API_KEY_PEPPER;
  if (!pepper || pepper.length < 32 || pepper === developmentApiKeyPepper) {
    context.addIssue({
      code: "custom",
      path: ["FULFILLMENTY_API_KEY_PEPPER"],
      message: "Set a unique secret of at least 32 characters before running in production.",
    });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid API environment configuration", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  databaseUrl: parsed.data.DATABASE_URL,
  host: parsed.data.API_HOST,
  port: parsed.data.API_PORT,
  webOrigins: parsed.data.WEB_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  localDemo: parsed.data.FULFILLMENTY_LOCAL_DEMO === "true",
  apiKeyPepper: parsed.data.FULFILLMENTY_API_KEY_PEPPER ?? developmentApiKeyPepper,
};
