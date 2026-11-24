import type { MenuItem } from "../FileTree";

export type Toast = { text: string; kind?: "error"; actions?: { label: string; run(): void }[] };
export type Menu = { x: number; y: number; items: MenuItem[] };
