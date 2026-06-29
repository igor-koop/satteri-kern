declare module "kern-typ" {
  export interface KernOptions {
    displayMode?: boolean;
    throwOnError?: boolean;
    errorColor?: string;
    macros?: Record<string, string>;
    output?: "mathml" | "html" | "htmlAndMathml";
    trust?: boolean | ((context: { command: string; url: string; protocol: string }) => boolean);
    strict?: boolean | "ignore" | "warn" | "error";
  }
  export function renderToString(source: string, options?: KernOptions): string;
}
