import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createCalendarWorker } from "../_shared/google-calendar-worker.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(url, key, {
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
  },
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createCalendarWorker({
    config: {
      enabled: Deno.env.get("GOOGLE_CALENDAR_ENABLED") === "true",
      appUrl: Deno.env.get("PUBLIC_APP_URL") ?? "",
      redirectUri:
        Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ??
        `${url}/functions/v1/google-calendar`,
      clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
      clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
      encryptionKey: Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "",
    },
    workerSecret: Deno.env.get("GOOGLE_CALENDAR_WORKER_SECRET") ?? "",
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error("calendar job failed");
      return data;
    },
  }),
);
