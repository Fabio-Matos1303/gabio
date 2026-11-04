type NavigationPage = "home" | "tasks" | "finance" | "settings";

const destinations: Array<{
  page: NavigationPage;
  href: string;
  label: string;
  path: string;
}> = [
  {
    page: "home",
    href: "#inicio",
    label: "Início",
    path: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  },
  {
    page: "tasks",
    href: "#tarefas",
    label: "Tarefas",
    path: "M9 5h11v16H4V5h2m3-2h6v4H9ZM7 12l1 1 2-2m3 1h4M7 17l1 1 2-2m3 1h4",
  },
  {
    page: "finance",
    href: "#financas",
    label: "Finanças",
    path: "M20 8V5a2 2 0 0 0-2-2L4 6m0 0h15a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 1-2Zm13 7h4m-4 0v3h4",
  },
  {
    page: "settings",
    href: "#configuracoes",
    label: "Ajustes",
    path: "m9 3-.5 3-2 1-2.5-1.5-2 3.5L4.5 11v2L2 15l2 3.5L6.5 17l2 1L9 21h4l.5-3 2-1 2.5 1.5 2-3.5-2.5-2v-2L20 9l-2-3.5L15.5 7l-2-1L13 3Zm6 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  },
];

export function BottomNavigation({
  page,
  taskMvp,
}: {
  page: NavigationPage;
  taskMvp: boolean;
}) {
  const items = destinations.filter(
    (item) => !taskMvp || item.page === "tasks" || item.page === "settings",
  );
  const activeIndex = items.findIndex((item) => item.page === page);
  return (
    <nav
      className="bottom-nav glass-surface"
      aria-label="Navegação principal"
      style={
        {
          "--navigation-count": items.length,
          "--navigation-index": activeIndex,
        } as CSSProperties
      }
    >
      {activeIndex >= 0 && (
        <i className="navigation-selection" aria-hidden="true" />
      )}
      {items.map((item) => (
        <a
          key={item.page}
          href={item.href}
          aria-current={page === item.page ? "page" : undefined}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d={item.path}
              fill={
                item.page === "home" && page === "home"
                  ? "currentColor"
                  : "none"
              }
            />
          </svg>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
import type { CSSProperties } from "react";
