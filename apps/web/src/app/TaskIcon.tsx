const paths = {
  pencil: "m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  up: "m6 10 6-6 6 6M12 4v16",
  down: "m6 14 6 6 6-6M12 4v16",
  person: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  people:
    "M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-3a7 7 0 0 1 14 0v3M19 4a3 3 0 0 1 0 6M22 20v-3a5 5 0 0 0-3-5",
  repeat:
    "m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3",
  flag: "M5 22V3m0 0c5-4 9 4 14 0v11c-5 4-9-4-14 0",
  tag: "M3 3h8l10 10-8 8L3 11V3Zm4 4h.01",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4",
  board: "M3 4h7v16H3zM14 4h7v10h-7z",
  calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 11h16",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  filter: "M4 6h16M7 12h10m-7 6h4",
  sort: "M8 4v16m-4-4 4 4 4-4M15 6h6m-6 6h4m-4 6h2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  refresh:
    "M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6",
  warning: "m12 3 10 18H2zM12 9v5m0 3h.01",
};
export function TaskIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="task-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 4 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
