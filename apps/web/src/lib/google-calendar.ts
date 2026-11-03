import { z } from "zod";
export const GOOGLE_PROJECTIONS_CHANGED_EVENT =
  "gabio:google-projections-changed";

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
    readSources: z.boolean().optional(),
    writeTasks: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.exportHousehold || value.exportPrivate);
export type GoogleCalendarConnect = GoogleCalendarPreferences & {
  importUpcoming: boolean;
  readSources?: boolean;
  writeTasks?: boolean;
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

export const googleReadingPermissionSchema = z
  .object({
    state: z.enum([
      "authorized",
      "not_authorized",
      "reconnect",
      "disconnecting",
      "disabled",
    ]),
  })
  .strict();
export type GoogleReadingPermission = z.infer<
  typeof googleReadingPermissionSchema
>;

export const googleExportStatusSchema = z
  .object({
    newTaskDestination: z.enum(["google_tasks", "google_calendar"]),
    version: z.number().int().positive(),
    tasksAuthorized: z.boolean(),
    routingEnabled: z.boolean(),
  })
  .strict();
export type GoogleExportStatus = z.infer<typeof googleExportStatusSchema>;
export const googleExportPreferencesSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    destination: z.enum(["google_tasks", "google_calendar"]),
  })
  .strict();
export type GoogleExportPreferences = z.infer<
  typeof googleExportPreferencesSchema
>;
