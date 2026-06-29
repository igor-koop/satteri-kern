# satteri-kern

[![npm](https://img.shields.io/npm/v/satteri-kern)](https://www.npmjs.com/package/satteri-kern) [![License](https://img.shields.io/github/license/igor-koop/satteri-kern)](https://github.com/igor-koop/satteri-kern/blob/main/LICENSE) [![Coverage](https://codecov.io/gh/igor-koop/satteri-kern/graph/badge.svg)](https://codecov.io/gh/igor-koop/satteri-kern) [![Lint](https://img.shields.io/badge/lint-oxlint-ea580c)](https://oxc.rs/docs/guide/usage/linter) [![Types](https://img.shields.io/badge/types-TypeScript-3178c6)](https://www.typescriptlang.org/) [![Actions](https://github.com/igor-koop/satteri-kern/actions/workflows/actions.yml/badge.svg)](https://github.com/igor-koop/satteri-kern/actions/workflows/actions.yml)

Satteri plugin to render Typst math expressions to MathML using [kern-typ](https://github.com/igor-koop/kern-typ). Both inline (`$...$`) and display (`$$...$$`) math are supported, in Markdown and MDX.

## Installation

```sh
npm install satteri-kern
```

## Usage

```ts
import { markdownToHtml } from "satteri";
import { satteriKern } from "satteri-kern";

const { html } = markdownToHtml("Euler: $e^(i pi) + 1 = 0$", {
  features: { math: true },
  mdastPlugins: [satteriKern()],
});

// html contains a <math> element rendered by kern
```

## Options

| Option       | Type                                                        | Default      | Description                                                        |
| ------------ | ----------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `output`     | `"mathml" \| "html" \| "htmlAndMathml"`                    | `"mathml"`   | Output format. `"html"` requires `kern-typ/kern.css`.              |
| `errorColor` | `string`                                                    | `"#cc0000"`  | Color of the fallback error span when a math expression fails.     |
| `macros`     | `Record<string, string>`                                    | —            | Custom macro definitions (`{ name: expansion }`).                  |
| `trust`      | `boolean \| (ctx) => boolean`                              | `false`      | Allow kern to execute `\url` and similar commands.                 |
| `strict`     | `boolean \| "ignore" \| "warn" \| "error"`                 | `"warn"`     | How kern handles unrecognised commands or non-fatal issues.        |

### Error handling

When kern cannot render an expression it tries twice: first with strict errors, then leniently. If both fail, the plugin emits a `<span class="kern-error">` containing the raw source with the error in a `title` attribute. The plugin never throws.

## Development

```sh
git clone https://github.com/igor-koop/satteri-kern
cd satteri-kern
npm install
```

| Script          | Description                                        |
| --------------- | -------------------------------------------------- |
| `npm run build` | Compile ESM and type declarations into `dist/`.    |
| `npm test`      | Run the Vitest test suite.                         |
| `npm run cov`   | Run tests with V8 coverage.                        |
| `npm run check` | Format check, lint, and TypeScript typecheck.      |
| `npm run fmt`   | Auto-format with oxfmt.                            |

## License

[MIT](LICENSE)
