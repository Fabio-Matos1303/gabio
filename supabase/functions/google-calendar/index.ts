import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createCalendarHandler } from "../_shared/google-calendar-service.ts";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonymousKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
const admin = createClient(supabaseUrl, serviceKey, {
  global: { fetch: fetchWithTimeout },
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(
  createCalendarHandler({
    config: {
      enabled: Deno.env.get("GOOGLE_CALENDAR_ENABLED") === "true",
      appUrl: Deno.env.get("PUBLIC_APP_URL") ?? "",
      redirectUri:
        Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ??
        `${supabaseUrl}/functions/v1/google-calendar`,
      clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "",
      clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "",
      encryptionKey: Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY") ?? "",
    },
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error("calendar operation failed");
      return data;
    },
    async authenticate(authorization) {
      const user = createClient(supabaseUrl, anonymousKey, {
        global: {
          fetch: fetchWithTimeout,
          headers: { Authorization: authorization },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await user.auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
  }),
);
