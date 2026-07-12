export function markdownTheme(mode: "auto" | "light" | "dark" | string): "light" | "dark" | undefined {
  return mode === "auto" ? undefined : mode === "dark" ? "dark" : "light";
}
