# prquicktest

Run code blocks from the "Testing" section of GitHub PR descriptions.

## Install

```bash
npm install -g prquicktest
```

Or run directly:

```bash
npx prquicktest https://github.com/owner/repo/pull/123
```

## Usage

```bash
prquicktest <pr-url>           # Fetch PR and run test code blocks
prquicktest <file.md>          # Run from local file
prquicktest -y <pr-url>        # Skip confirmation prompt
```

## Security

Before executing any code, prquicktest shows a preview of all code blocks and asks for confirmation:

```
Found 2 code block(s) to execute:

[bash]
  npm test

[bash]
  npm run build

⚠ WARNING: This will execute code on your machine.
Proceed? [y/N]
```

Use `-y` or `--yes` to skip the prompt (for trusted sources only).

## How It Works

Only executes code blocks found under a **Testing**, **Tests**, or **Test** header (any level: `#`, `##`, `###`, etc.). The section ends when another header of equal or higher level appears.

### Example PR Description

```markdown
## Summary
This PR adds a new feature.

## Testing
Run the tests:

```bash
npm test
```

Verify the build:

```bash
npm run build
```

## Deployment
This section is ignored.
```

Running `prquicktest <pr-url>` will only execute the two bash blocks under "Testing".

## Supported Languages

| Language | Aliases | Executor |
|----------|---------|----------|
| Bash | `bash`, `sh`, `shell` | `bash -c` |
| JavaScript | `javascript`, `js`, `node` | `node -e` |
| Python | `python`, `py`, `python3` | `python3 -c` |

## Requirements

- Node.js 18+
- [GitHub CLI](https://cli.github.com) (`gh`) installed and authenticated

## License

MIT
