import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluate, markdownToHtml } from "satteri";
import type { EvaluateOptions } from "satteri";
import * as runtime from "react/jsx-runtime";
import * as kernModule from "kern-typ";

import satteriKernDefault, { satteriKern } from "./index.js";
import type { SatteriKernOptions } from "./index.js";

// Wrap renderToString in a spy so individual tests can override it for the
// error-fallback paths without affecting the rest of the suite.
vi.mock("kern-typ", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kern-typ")>();
  return { ...actual, renderToString: vi.fn(actual.renderToString) };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mdHtml(source: string, options: SatteriKernOptions = {}) {
  return markdownToHtml(source, {
    features: { math: true },
    mdastPlugins: [satteriKern(options)],
  }).html;
}

function mdxHtml(source: string, options: SatteriKernOptions = {}) {
  const module = evaluate(source, {
    Fragment: runtime.Fragment,
    fileURL: new URL("file:///example.mdx"),
    jsx: runtime.jsx as EvaluateOptions["jsx"],
    jsxs: runtime.jsxs as EvaluateOptions["jsxs"],
    features: { math: true },
    mdastPlugins: [satteriKern(options)],
  });

  if (module instanceof Promise) {
    throw new Error("Expected sync MDX evaluation");
  }

  const Content = module.default;
  return renderToStaticMarkup(runtime.jsx(Content as Parameters<typeof runtime.jsx>[0], {}));
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Representative expressions drawn from the kern examples gallery.
 * Each entry is [description, Typst math source].
 */
const KERN_EXPRESSIONS: [string, string][] = [
  ["Euler's identity", "e^(i pi) + 1 = 0"],
  ["Pythagorean theorem", "a^2 + b^2 = c^2"],
  ["quadratic formula", "x = frac(-b plus.minus sqrt(b^2 - 4 a c), 2 a)"],
  ["golden ratio", "phi = frac(1 + sqrt(5), 2)"],
  ["sum of integers", "sum_(i=1)^n i = frac(n(n+1), 2)"],
  ["binomial theorem", "sum_(k=0)^n binom(n, k) x^k y^(n-k) = (x + y)^n"],
  ["Basel problem", "sum_(n=1)^infinity frac(1, n^2) = frac(pi^2, 6)"],
  ["3×3 identity matrix", "I_3 = mat(1, 0, 0; 0, 1, 0; 0, 0, 1)"],
  ["normal distribution", "p(x) = frac(1, sigma sqrt(2 pi)) e^(- frac((x - mu)^2, 2 sigma^2))"],
  ["piecewise (cases)", `sgn(x) = cases(1 "if" x > 0, 0 "if" x = 0, -1 "if" x < 0)`],
  ["Greek letters", "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu"],
  ["style variants", "cal(F) + bb(R) + frak(g) + bold(v)"],
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("satteriKern", () => {
  describe("exports", () => {
    it("named and default exports produce identical output", () => {
      const fromNamed = mdHtml("$x^2$");
      const fromDefault = markdownToHtml("$x^2$", {
        features: { math: true },
        mdastPlugins: [satteriKernDefault()],
      }).html;

      expect(fromNamed).toBe(fromDefault);
    });
  });

  describe("inline math", () => {
    it("renders inline math to MathML in Markdown", () => {
      const html = mdHtml("Euler: $e^(i pi) + 1 = 0$");

      expect(html).toContain("<math");
      expect(html).toContain("</math>");
    });

    it("renders inline math to MathML in MDX", () => {
      const html = mdxHtml("Euler: $e^(i pi) + 1 = 0$");

      expect(html).toContain("<math");
      expect(html).toContain("</math>");
    });

    it("renders multiple inline math expressions within one paragraph", () => {
      const html = mdHtml("From $a$ to $b$ via $c$.");

      expect(html.match(/<math/g)?.length).toBe(3);
    });

    it("preserves plain text before and after inline math", () => {
      const html = mdHtml("Before $x^2$ after.");

      expect(html).toContain("Before");
      expect(html).toContain("after.");
      expect(html).toContain("<math");
    });

    it("preserves surrounding inline nodes such as strong and links", () => {
      const html = mdHtml("**Bold $a^2$** and [link $b^2$](https://example.com).");

      expect(html.match(/<math/g)?.length).toBe(2);
      expect(html).toContain("<strong");
      expect(html).toContain("<a ");
    });
  });

  describe("display math", () => {
    it("renders $$ block math to MathML in Markdown", () => {
      const html = mdHtml("$$\nfrac(x^2 + 1, 2 x)\n$$");

      expect(html).toContain("<math");
      expect(html).toContain("</math>");
    });

    it("renders display math to MathML in MDX", () => {
      const html = mdxHtml("$$\nfrac(x, y)\n$$");

      expect(html).toContain("<math");
      expect(html).toContain("</math>");
    });

    it("renders a multiline alignment block in display mode", () => {
      const html = mdHtml(
        "$$\na x^2 + b x + c &= a (x^2 + b/a x) + c \\\\ &= a (x + b/(2 a))^2 + c - b^2/(4 a)\n$$",
      );

      expect(html).toContain("<math");
    });
  });

  describe("kern expression gallery", () => {
    it.each(KERN_EXPRESSIONS)("renders %s to MathML", (_, expr) => {
      expect(mdHtml(`$${expr}$`)).toContain("<math");
    });
  });

  describe("output option", () => {
    it("defaults to mathml, producing a <math element", () => {
      expect(mdHtml("$x$")).toContain("<math");
    });

    it("explicit output: mathml matches the implicit default", () => {
      expect(mdHtml("$x$", { output: "mathml" })).toBe(mdHtml("$x$"));
    });

    it("output: html produces HTML without a <math element", () => {
      const html = mdHtml("$x$", { output: "html" });

      expect(html).not.toContain("<math");
    });

    it("output: html in MDX inline math falls back to a span wrapper", () => {
      const html = mdxHtml("$x$", { output: "html" });

      expect(html).not.toContain("<math");
      expect(html).toContain("<span");
    });

    it("output: htmlAndMathml produces both a <math element and HTML", () => {
      const html = mdHtml("$x$", { output: "htmlAndMathml" });

      expect(html).toContain("<math");
    });

    it.each(["html", "htmlAndMathml"] as const)("output: %s renders without throwing", (output) => {
      expect(() => mdHtml("$a^2 + b^2 = c^2$", { output })).not.toThrow();
    });
  });

  describe("error handling", () => {
    afterEach(() => {
      vi.mocked(kernModule.renderToString).mockRestore();
    });

    it("does not throw on invalid math and returns a string", () => {
      expect(() => mdHtml("$@@@$")).not.toThrow();
      expect(typeof mdHtml("$@@@$")).toBe("string");
    });

    it("renders a kern-error span when all kern render attempts fail", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw new Error("kern: strict render failed");
        })
        .mockImplementationOnce(() => {
          throw new Error("kern: lenient render failed");
        });

      const html = mdHtml("$x$");

      expect(html).toContain('class="kern-error"');
    });

    it("uses the default error color (#cc0000) in the error span", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw new Error("fail");
        })
        .mockImplementationOnce(() => {
          throw new Error("fail");
        });

      const html = mdHtml("$x$");

      expect(html).toContain("color:#cc0000");
    });

    it("uses a custom errorColor in the error span", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw new Error("fail");
        })
        .mockImplementationOnce(() => {
          throw new Error("fail");
        });

      const html = mdHtml("$x$", { errorColor: "#ff6600" });

      expect(html).toContain("color:#ff6600");
    });

    it("surfaces the error message in the title attribute of the error span", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw new Error("something went wrong");
        })
        .mockImplementationOnce(() => {
          throw new Error("something went wrong");
        });

      const html = mdHtml("$x$");

      expect(html).toContain('title="');
      expect(html).toContain("something went wrong");
    });

    it("wraps non-Error throws in a new Error during render", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw "not an error object";
        })
        .mockImplementationOnce(() => {
          throw "not an error object";
        });

      const html = mdHtml("$x$");

      expect(html).toContain('class="kern-error"');
      expect(html).toContain("not an error object");
    });

    it("escapes HTML characters in the error span title and content", () => {
      vi.mocked(kernModule.renderToString)
        .mockImplementationOnce(() => {
          throw new Error('<script>alert("xss")</script>');
        })
        .mockImplementationOnce(() => {
          throw new Error('<script>alert("xss")</script>');
        });

      const html = mdHtml('$<b>"test"</b>$');

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<b>");
      expect(html).toContain("&lt;b&gt;");
    });
  });
});
