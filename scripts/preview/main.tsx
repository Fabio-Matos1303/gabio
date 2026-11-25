import { createRoot } from "react-dom/client";
import {
  taskSchema,
  taskCardCommandSchema,
  taskCardContentSchema,
  type Task,
  type TaskCardContent,
} from "@gabio/contracts";
import { App } from "../../apps/web/src/app/App";
import type {
  AppGateway,
  SessionUser,
  HouseholdContext,
} from "../../apps/web/src/lib/app-gateway";
import "../../apps/web/src/styles.css";
const user: SessionUser = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "pessoa@example.test",
  displayName: "Pessoa A",
};
const house: HouseholdContext = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Casa de teste",
  role: "owner",
  members: [
    { userId: user.id, displayName: "Pessoa A", role: "owner" },
    {
      userId: "10000000-0000-4000-8000-000000000002",
      displayName: "Pessoa B",
      role: "member",
    },
  ],
};
let tasks: Task[] = [
  ["Organizar a lista de compras da semana", "open"],
  ["Agendar manutenção preventiva", "open"],
  ["Separar roupas para doação", "in_progress"],
  ["Revisar contas da casa", "completed"],
].map(([title, status], index) =>
  taskSchema.parse({
    id: "40000000-0000-4000-8000-00000000000" + (index + 1),
    householdId: house.id,
    ownerUserId: user.id,
    createdBy: user.id,
    assigneeUserId: user.id,
    title,
    priority: index === 0 ? "medium" : "low",
    status,
    visibility: "household",
    recurrence: "none",
    dueAt: index === 0 ? null : `2026-11-0${index + 1}T12:00:00Z`,
    tags: index % 2 === 0 ? ["Casa"] : ["Manutenção"],
    completedAt: status === "completed" ? new Date().toISOString() : null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
);
const unavailable = async () => {
  throw new Error("Não disponível nesta prévia sintética");
};
let catalog = [
  {
    id: "80000000-0000-4000-8000-000000000001",
    name: "Casa",
    visibility: "household" as "household" | "private",
    version: 1,
  },
  {
    id: "80000000-0000-4000-8000-000000000002",
    name: "Manutenção",
    visibility: "household" as "household" | "private",
    version: 1,
  },
];
const tagReceipts = new Set<string>();
const cardContent = new Map<string, TaskCardContent>();
cardContent.set(tasks[0]!.id, {
  taskId: tasks[0]!.id,
  notes:
    "Organizar os itens por categoria e conferir o que já existe na despensa.\nUsar esta checklist como apoio para a próxima compra.",
  notesVersion: 1,
  checklists: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      title: "Preparar a compra",
      version: 1,
      items: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          text: "Conferir a despensa",
          completed: true,
        },
        {
          id: "60000000-0000-4000-8000-000000000002",
          text: "Separar itens de limpeza",
          completed: false,
        },
        {
          id: "60000000-0000-4000-8000-000000000003",
          text: "Revisar a lista antes de sair",
          completed: false,
        },
      ],
    },
  ],
});
const cardReceipts = new Set<string>();
const gateway: AppGateway = {
  isConfigured: true,
  getSession: async () => user,
  onAuthStateChange: () => () => {},
  signIn: unavailable,
  signOut: async () => {},
  sendPasswordReset: unavailable,
  updatePassword: unavailable,
  loadHousehold: async () => house,
  loadPendingInvitation: async () => null,
  createHousehold: unavailable,
  acceptInvitation: unavailable,
  inviteMember: unavailable,
  updateProfile: async () => {},
  getGoogleReadingPermission: async () => ({
    state:
      new URLSearchParams(window.location.search).get("readingPreview") ===
      "authorized"
        ? "authorized"
        : "not_authorized",
  }),
  getGoogleCalendarStatus: async () => ({
    enabled: true,
    connection:
      new URLSearchParams(window.location.search).get("googlePreview") ===
      "connected"
        ? {
            status: "connected",
            exportHousehold: true,
            exportPrivate: false,
            reminderMinutes: null,
            lastSyncedAt: "2026-11-03T12:00:00Z",
            pendingCount: 2,
            failedCount: 0,
          }
        : null,
  }),
  connectGoogleCalendar: async () => {
    throw new Error("Integração indisponível");
  },
  saveGoogleCalendarPreferences: async () => {},
  completeGoogleCalendar: async () => {},
  repairGoogleCalendar: async () => {},
  syncGoogleCalendar: async () => {},
  disconnectGoogleCalendar: async () => {},
  getTelegramConnection: async () => null,
  requestTelegramPairing: unavailable,
  revokeTelegramConnection: async () => {},
  listTaskTags: async () => {
    for (const t of tasks)
      for (const name of t.tags ?? [])
        if (
          !catalog.some((g) => g.name === name && g.visibility === t.visibility)
        )
          catalog.push({
            id: crypto.randomUUID(),
            name,
            visibility: t.visibility,
            version: 1,
          });
    return catalog.map((t) => ({ ...t }));
  },
  executeTagCommand: async (command) => {
    if (tagReceipts.has(command.commandId)) return;
    const g = catalog.find(
      (t) => t.id === command.tagId && t.version === command.expectedVersion,
    );
    if (!g) throw new Error("Tag alterada");
    tasks = tasks.map((t) =>
      t.visibility === g.visibility && (t.tags ?? []).includes(g.name)
        ? {
            ...t,
            tags:
              command.type === "delete"
                ? (t.tags ?? []).filter((n) => n !== g.name)
                : (t.tags ?? []).map((n) => (n === g.name ? command.name : n)),
            version: t.version + 1,
          }
        : t,
    );
    catalog =
      command.type === "delete"
        ? catalog.filter((t) => t.id !== g.id)
        : catalog.map((t) =>
            t.id === g.id
              ? { ...t, name: command.name, version: t.version + 1 }
              : t,
          );
    tagReceipts.add(command.commandId);
  },
  readGoogleItems: async () => ({
    state: "connected",
    generation: "90000000-0000-4000-8000-000000000001",
    checkedAt: new Date().toISOString(),
    tasksState: "ok",
    calendarState: "ok",
    sources: [
      {
        id: "synthetic-list",
        name: "Lista de exemplo",
        source: "google_tasks",
      },
      {
        id: "synthetic-calendar",
        name: "Agenda de exemplo",
        source: "google_calendar",
      },
    ],
    items: [
      {
        id: "synthetic-task",
        remoteId: "synthetic-task",
        source: "google_tasks",
        sourceId: "synthetic-list",
        sourceName: "Lista de exemplo",
        title: "Comprar materiais de organização",
        status: "open",
        date: "2026-11-02",
        startsAt: null,
        endsAt: null,
        endDate: null,
        url: "https://tasks.google.com/",
        updatedAt: "2026-11-02T12:00:00Z",
        tags: ["Compras"],
      },
      {
        id: "synthetic-event",
        remoteId: "synthetic-event",
        source: "google_calendar",
        sourceId: "synthetic-calendar",
        sourceName: "Agenda de exemplo",
        title: "Visita de manutenção",
        status: "event",
        date: null,
        startsAt: "2026-11-02T18:00:00Z",
        endsAt: "2026-11-02T19:00:00Z",
        endDate: null,
        url: "https://calendar.google.com/",
        updatedAt: "2026-11-02T12:00:00Z",
        tags: [],
      },
    ],
  }),
  saveExternalTaskTags: async () => {},
  listTasks: async () =>
    tasks.map((t) => {
      const content = cardContent.get(t.id);
      const items = content?.checklists.flatMap((c) => c.items) ?? [];
      return {
        ...t,
        cardSummary: {
          hasNotes: !!content?.notes.trim(),
          totalItems: items.length,
          completedItems: items.filter((i) => i.completed).length,
        },
      };
    }),
  readTaskCard: async (taskId) =>
    taskCardContentSchema.parse(
      structuredClone(
        cardContent.get(taskId) ?? {
          taskId,
          notes: "",
          notesVersion: 0,
          checklists: [],
        },
      ),
    ),
  executeTaskCardCommand: async (value) => {
    const command = taskCardCommandSchema.parse(value);
    const p = command.payload;
    if (!cardReceipts.has(command.commandId)) {
      const content = structuredClone(
        cardContent.get(p.taskId) ?? {
          taskId: p.taskId,
          notes: "",
          notesVersion: 0,
          checklists: [],
        },
      );
      if (command.type === "save_notes") {
        content.notes = command.payload.notes;
        content.notesVersion++;
      } else if (command.type === "delete_checklist")
        content.checklists = content.checklists.filter(
          (c) => c.id !== command.payload.checklistId,
        );
      else {
        const p = command.payload;
        const existing = content.checklists.find((c) => c.id === p.checklistId);
        content.checklists = content.checklists.filter(
          (c) => c.id !== p.checklistId,
        );
        content.checklists.push({
          id: p.checklistId,
          title: p.title,
          items: p.items,
          version: (existing?.version ?? 0) + 1,
        });
      }
      cardContent.set(p.taskId, taskCardContentSchema.parse(content));
      cardReceipts.add(command.commandId);
    }
    return { commandId: command.commandId, taskId: p.taskId, replayed: false };
  },
  listCalendarEvents: async () => [],
  loadFinance: async () => ({
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    recurrences: [],
  }),
  prepareFinanceCommand: unavailable,
  confirmFinanceCommand: unavailable,
  executeTaskCommand: async (command) => {
    let task: Task;
    if (command.type === "create")
      task = taskSchema.parse({
        ...command.payload,
        id: crypto.randomUUID(),
        householdId: house.id,
        ownerUserId: user.id,
        createdBy: user.id,
        status: "open",
        completedAt: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    else {
      const old = tasks.find((item) => item.id === command.payload.taskId);
      if (!old) throw new Error("Tarefa indisponível");
      const fields =
        command.type === "update"
          ? {
              priority: command.payload.priority ?? old.priority,
              tags: command.payload.tags ?? old.tags,
              title: command.payload.title ?? old.title,
              kind: command.payload.kind ?? old.kind,
              eventEndsAt:
                command.payload.kind === "task"
                  ? null
                  : (command.payload.eventEndsAt ?? old.eventEndsAt),
              dueAt:
                command.payload.dueAt === undefined
                  ? old.dueAt
                  : command.payload.dueAt,
              recurrence: command.payload.recurrence ?? old.recurrence,
              recurrenceRule:
                command.payload.recurrenceRule === undefined
                  ? old.recurrenceRule
                  : command.payload.recurrenceRule,
              assigneeUserId:
                command.payload.assigneeUserId === undefined
                  ? old.assigneeUserId
                  : command.payload.assigneeUserId,
              visibility: command.payload.visibility ?? old.visibility,
            }
          : {
              status: command.payload.status,
              completedAt:
                command.payload.status === "completed"
                  ? new Date().toISOString()
                  : null,
            };
      task = taskSchema.parse({ ...old, ...fields, version: old.version + 1 });
      tasks = tasks.filter((item) => item.id !== task.id);
    }
    tasks = [task, ...tasks];
    return { commandId: command.commandId, replayed: false, task };
  },
};
createRoot(document.getElementById("root")!).render(
  <>
    <div style={{ padding: 8, textAlign: "center", background: "#fff3c4" }}>
      Prévia local • dados fictícios • sem conexão com produção
    </div>
    <App gateway={gateway} />
  </>,
);
