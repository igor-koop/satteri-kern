import {
  defineMdastPlugin,
  type MdastContent,
  type MdastNode,
  type MdastPluginInstance,
  type MdxJsxTextElement,
} from "satteri";
import { renderToString } from "kern-typ";

/** Configuration options for {@link satteriKern}. */
export interface SatteriKernOptions {
  /**
   * Output format produced by kern.
   *
   * - `"mathml"` — MathML only (no external stylesheet required).
   * - `"html"` — HTML with CSS classes (requires `kern-typ/kern.css`).
   * - `"htmlAndMathml"` — both outputs combined.
   *
   * @default "mathml"
   */
  readonly output?: "mathml" | "html" | "htmlAndMathml";
  /**
   * Color used for the error fallback when a math expression cannot be
   * rendered even leniently.
   *
   * @default "#cc0000"
   */
  readonly errorColor?: string;
  /**
   * Custom macro definitions. Each key is a macro name and each value is its
   * Typst expansion.
   */
  readonly macros?: Record<string, string>;
  /**
   * Controls whether kern is allowed to execute `\url` and similar commands.
   * Pass `true` to allow all, `false` to deny all, or a predicate for
   * fine-grained control.
   *
   * @default false
   */
  readonly trust?:
    | boolean
    | ((context: { command: string; url: string; protocol: string }) => boolean);
  /**
   * How kern handles unrecognised commands or other non-fatal issues.
   *
   * - `"ignore"` / `false` — silently ignore.
   * - `"warn"` — log a console warning.
   * - `"error"` / `true` — throw an error.
   *
   * @default "warn"
   */
  readonly strict?: boolean | "ignore" | "warn" | "error";
}

/** The plugin instance type returned by {@link satteriKern}. */
export interface SatteriKernPlugin {
  name: "satteri-kern";
  math(...args: Parameters<NonNullable<MdastPluginInstance["math"]>>): MdastContent | void;
  inlineMath(
    ...args: Parameters<NonNullable<MdastPluginInstance["inlineMath"]>>
  ): MdastContent | void;
}

/** {@link SatteriKernOptions} with defaults applied. */
type Config = Readonly<
  Omit<SatteriKernOptions, "output"> & { output: NonNullable<SatteriKernOptions["output"]> }
>;

/** MDAST node that carries a math expression as a `value` string. */
type MathLikeNode = Extract<MdastNode, { type: "math" | "inlineMath"; value: string }>;

/** Visitor context shape required by {@link renderMath} to report errors. */
interface DiagnosticContext {
  report(input: {
    message: string;
    node?: Readonly<MdastNode>;
    severity?: "error" | "warning" | "info";
  }): void;
}

/** HTML special characters mapped to their entity equivalents. */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Create the satteri mdast plugin that renders Typst math expressions to MathML
 * (or HTML/CSS) using kern. Both inline math (`$...$`) and display math
 * (`$$...$$`) are supported.
 *
 * @param options - Plugin configuration; every field is optional and falls back
 *   to the default documented on {@link SatteriKernOptions}.
 * @returns A plugin instance to register in satteri's `mdastPlugins` option.
 *
 * @example
 * ```ts
 * import { markdownToHtml } from "satteri";
 * import { satteriKern } from "satteri-kern";
 *
 * const { html } = markdownToHtml("Euler: $e^(i pi) + 1 = 0$", {
 *   features: { math: true },
 *   mdastPlugins: [satteriKern()],
 * });
 * // html contains a <math> element rendered by kern
 * ```
 */
export function satteriKern(options?: Readonly<SatteriKernOptions>): SatteriKernPlugin {
  const config: Config = { output: "mathml", ...options };

  return defineMdastPlugin({
    name: "satteri-kern" as const,

    math(node, ctx) {
      return { rawHtml: renderMath(node, true, config, ctx) };
    },

    inlineMath(node, ctx) {
      const rendered = renderMath(node, false, config, ctx);
      if (isMdx(ctx.fileURL)) {
        return createMdxInlineMath(rendered) as unknown as MdastContent;
      }
      return { type: "html" as const, value: rendered };
    },
  }) as SatteriKernPlugin;
}

/**
 * Returns `true` when the document URL ends with `.mdx` (case-insensitive),
 * `false` otherwise. A missing URL is treated as plain Markdown.
 *
 * @param fileURL - The document URL exposed as `ctx.fileURL`, or `undefined`.
 */
function isMdx(fileURL: { readonly pathname: string } | undefined): boolean {
  return fileURL?.pathname.toLowerCase().endsWith(".mdx") ?? false;
}

/**
 * Build an `mdxJsxTextElement` containing kern's MathML output. The outer
 * `<math ...>...</math>` wrapper from kern is stripped and its inner content
 * is injected via `dangerouslySetInnerHTML`.
 *
 * @param rendered - The kern HTML/MathML output to inject.
 * @returns A satteri-compatible MDAST inline JSX element.
 */
function createMdxInlineMath(rendered: string): MdxJsxTextElement {
  const match = rendered.match(/^<math([^>]*)>([\s\S]*)<\/math>$/);
  const [name, innerHTML] = match ? ["math", match[2]!] : ["span", rendered];

  return {
    type: "mdxJsxTextElement",
    name,
    attributes: [
      {
        type: "mdxJsxAttribute",
        name: "dangerouslySetInnerHTML",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: `{__html:${JSON.stringify(innerHTML)}}`,
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: {
                    type: "ObjectExpression",
                    properties: [
                      {
                        type: "Property",
                        kind: "init",
                        method: false,
                        shorthand: false,
                        computed: false,
                        key: { type: "Identifier", name: "__html" },
                        value: {
                          type: "Literal",
                          value: innerHTML,
                          raw: JSON.stringify(innerHTML),
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    ],
    children: [],
  } as unknown as MdxJsxTextElement;
}

/**
 * Render a math node to a string using kern, with a two-pass fallback: strict
 * render first, then lenient (`throwOnError: false`), then a bare error `span`.
 *
 * @param node - The MDAST `math` or `inlineMath` node to render.
 * @param displayMode - `true` for block (display) math, `false` for inline.
 * @param config - Resolved plugin configuration with defaults applied.
 * @param ctx - Satteri diagnostic context for reporting render errors.
 * @returns The rendered output string from kern.
 */
function renderMath(
  node: Readonly<MathLikeNode>,
  displayMode: boolean,
  config: Readonly<Config>,
  ctx: DiagnosticContext,
): string {
  const { value } = node;

  try {
    return renderToString(value, { ...config, displayMode, throwOnError: true });
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));

    ctx.report({
      message: `Could not render math with kern: ${cause.message}`,
      node,
      severity: "error",
    });

    try {
      return renderToString(value, { ...config, displayMode, throwOnError: false });
    } catch {
      return renderKernError(value, error, config);
    }
  }
}

/**
 * Build a styled error `span` for math that could not be rendered even
 * leniently. The error message is surfaced as a `title` attribute.
 *
 * @param value - The raw math source that failed to render.
 * @param error - The error thrown by kern.
 * @param config - Resolved plugin configuration, used for `errorColor`.
 * @returns An HTML string containing a `span` with the error details.
 */
function renderKernError(value: string, error: unknown, config: Readonly<Config>): string {
  const title = escapeHtml(String(error));
  const color = escapeHtml(config.errorColor ?? "#cc0000");
  const content = escapeHtml(value);
  return `<span class="kern-error" style="color:${color}" title="${title}">${content}</span>`;
}

/**
 * Escape `&`, `<`, `>`, `"`, and `'` to their HTML entity equivalents.
 *
 * @param value - The raw string to escape.
 * @returns The escaped string, safe for HTML text and double-quoted attributes.
 *
 * @example
 * ```ts
 * escapeHtml('Tom & Jerry'); // 'Tom &amp; Jerry'
 * ```
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => HTML_ENTITIES[c]!);
}

export default satteriKern;
