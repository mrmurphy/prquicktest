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

## Shared Environment

All code blocks run sequentially in a **single persistent shell session**. Environment variables, working directory changes, and other shell state automatically persist across blocks.

### Export-only blocks

Blocks that contain only `export` statements run automatically without prompting. This is useful for setup blocks that configure environment variables for subsequent tests.

### Example with shared environment

```markdown
## Testing

### Setup environment
```bash
export BASE_URL="https://my-preview.onrender.com"
```

### Test 1: Check health endpoint
```bash
curl -s "$BASE_URL/health" | jq .
```
check: Response status is 200

### Test 2: Check API
```bash
curl -s "$BASE_URL/api/v1/status" | jq .
```
check: Response contains "ok"
```

The setup block runs silently and sets `BASE_URL`, which is then available in both test blocks.

## Supported Languages

| Language | Aliases |
|----------|---------|
| Bash | `bash`, `sh`, `shell`, `zsh` |

Code blocks with other language tags (e.g., `javascript`, `python`) are skipped with a warning.

## Security

**prquicktest executes arbitrary code from PR descriptions on your machine.** Review all code blocks before running them.

- Each code block is shown before execution, and confirmation is required (unless `-y` is used).
- All blocks execute in a single shell session. State set by earlier blocks (environment variables, working directory, aliases) affects all subsequent blocks. A malicious PR could set variables like `PATH`, `LD_PRELOAD`, or `NODE_OPTIONS` in an early block to influence later blocks.
- The shared shell doesn't fundamentally change the threat model — if you run the code, you're already trusting it. The `-y` flag is especially dangerous since it skips per-block confirmation.
- Export-only blocks (containing only `export` statements) run automatically without prompting. Review the PR description to ensure these are safe.

## Requirements

- Node.js 18+
- [GitHub CLI](https://cli.github.com) (`gh`) installed and authenticated

## License

MIT
