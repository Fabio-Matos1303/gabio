const paths = {
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
