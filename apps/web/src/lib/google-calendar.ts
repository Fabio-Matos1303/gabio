import { z } from "zod";

export const googleCalendarPreferencesSchema = z
  .object({
    exportHousehold: z.boolean(),
    exportPrivate: z.boolean(),
    reminderMinutes: z.number().int().min(0).max(10080).nullable(),
  })
  .strict()
  .refine((value) => value.exportHousehold || value.exportPrivate, {
    message: "Selecione pelo menos um grupo de tarefas.",
  });
export type GoogleCalendarPreferences = z.infer<
  typeof googleCalendarPreferencesSchema
>;
export const googleCalendarConnectSchema = z
  .object({
    exportHousehold: z.boolean(),
    exportPrivate: z.boolean(),
    reminderMinutes: z.number().int().min(0).max(10080).nullable(),
    importUpcoming: z.boolean(),
  })
  .strict()
  .refine((value) => value.exportHousehold || value.exportPrivate);
export type GoogleCalendarConnect = GoogleCalendarPreferences & {
  importUpcoming: boolean;
};
export const googleCalendarStatusSchema = z
  .object({
    enabled: z.boolean(),
    connection: z
      .object({
        status: z.enum([
          "connected",
          "reconnect",
          "disconnecting",
          "disconnected",
        ]),
        exportHousehold: z.boolean(),
        exportPrivate: z.boolean(),
        reminderMinutes: z.number().int().min(0).max(10080).nullable(),
        lastSyncedAt: z.string().datetime({ offset: true }).nullable(),
        pendingCount: z.number().int().nonnegative(),
        failedCount: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type GoogleCalendarStatus = z.infer<typeof googleCalendarStatusSchema>;
export const googleAuthorizationSchema = z
  .object({
    authorizationUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.origin === "https://accounts.google.com" &&
          url.pathname === "/o/oauth2/v2/auth" &&
          !url.username &&
          !url.password
        );
      }, "Destino de autorização inválido."),
  })
  .strict();
export const googleCalendarOkSchema = z
  .object({ ok: z.literal(true) })
  .strict();
