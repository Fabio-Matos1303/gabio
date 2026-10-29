import { createRoot } from "react-dom/client";
import { taskSchema, type Task } from "@gabio/contracts";
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
    status,
    visibility: "household",
    recurrence: "none",
    dueAt: null,
    completedAt: status === "completed" ? new Date().toISOString() : null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
);
const unavailable = async () => {
  throw new Error("Não disponível nesta prévia sintética");
};
const gateway: AppGateway = {
  isConfigured: true,
  getSession: async () => user,
  onAuthStateChange: () => () => {},
  signIn: unavailable,
  signOut: async () => {},
  sendPasswordReset: unavailable,
  updatePassword: unavailable,
  loadHousehold: async () => house,
  createHousehold: unavailable,
  acceptInvitation: unavailable,
  inviteMember: unavailable,
  updateProfile: async () => {},
  getGoogleCalendarStatus: async () => ({ enabled: true, connection: null }),
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
  listTasks: async () => tasks,
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
              title: command.payload.title ?? old.title,
              dueAt: command.payload.dueAt,
              recurrence: command.payload.recurrence ?? old.recurrence,
              assigneeUserId: command.payload.assigneeUserId ?? null,
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
