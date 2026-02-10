#!/usr/bin/env node

/**
 * prquicktest - Run code blocks from GitHub PR descriptions
 *
 * Usage:
 *   prquicktest <github-pr-url>
 *   prquicktest https://github.com/owner/repo/pull/123
 */

import { spawn, spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { createInterface } from 'readline';

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const langConfig = {
  bash: { cmd: 'bash', args: ['-c'] },
  sh: { cmd: 'sh', args: ['-c'] },
  shell: { cmd: 'bash', args: ['-c'] },
  javascript: { cmd: 'node', args: ['-e'] },
  js: { cmd: 'node', args: ['-e'] },
  node: { cmd: 'node', args: ['-e'] },
  python: { cmd: 'python3', args: ['-c'] },
  py: { cmd: 'python3', args: ['-c'] },
  python3: { cmd: 'python3', args: ['-c'] },
};

function isGitHubPrUrl(input) {
  return /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.test(input);
}

function fetchPrDescription(url) {
  console.log(`${colors.cyan}Fetching PR...${colors.reset}\n`);

  const result = spawnSync('gh', ['pr', 'view', url, '--json', 'body,title,url', '-q', '"# " + .title + "\n" + .url + "\n\n" + .body'], {
    encoding: 'utf-8',
    timeout: 30000,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`${colors.red}Error: GitHub CLI (gh) not found. Install from https://cli.github.com${colors.reset}`);
    } else {
      console.error(`${colors.red}Error: ${result.error.message}${colors.reset}`);
    }
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${colors.red}Error fetching PR: ${result.stderr}${colors.reset}`);
    process.exit(1);
  }

  return result.stdout;
}

/**
 * Check if a header line starts a "Testing" or "Tests" section
 */
function isTestingHeader(line) {
  const match = line.match(/^(#{1,6})\s+(.+)/);
  if (!match) return null;

  const level = match[1].length;
  const title = match[2].trim().toLowerCase();

  if (title === 'testing' || title === 'tests' || title === 'test') {
    return { level, title: match[2].trim() };
  }
  return null;
}

/**
 * Check if line is any header and return its level
 */
function getHeaderLevel(line) {
  const match = line.match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

/**
 * Check if a line starts a condition (case-insensitive)
 * Matches: "condition:", "check:", "check for:"
 */
function parseCondition(line) {
  const match = line.match(/^(condition|check\s*for|check)\s*:\s*(.+)/i);
  if (match) {
    return match[2].trim();
  }
  return null;
}

function parseMarkdown(content) {
  const blocks = [];
  const lines = content.split('\n');
  let i = 0;
  let inTestingSection = false;
  let testingSectionLevel = null;

  while (i < lines.length) {
    const line = lines[i];

    // Check for headers
    const testingHeader = isTestingHeader(line);
    const headerLevel = getHeaderLevel(line);

    if (testingHeader) {
      // Entering a testing section
      inTestingSection = true;
      testingSectionLevel = testingHeader.level;
      blocks.push({ type: 'text', content: line });
      i++;
      continue;
    } else if (headerLevel !== null && inTestingSection) {
      // Another header - check if it ends the testing section
      // (same level or higher/less # means we exit)
      if (headerLevel <= testingSectionLevel) {
        inTestingSection = false;
        testingSectionLevel = null;
      }
      i++;
      continue;
    }

    const codeMatch = line.match(/^```(\w+)?/);

    if (codeMatch) {
      const lang = codeMatch[1] || '';
      const codeLines = [];
      i++;

      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }

      // Only include code blocks from testing sections
      if (inTestingSection) {
        blocks.push({ type: 'code', lang: lang.toLowerCase(), content: codeLines.join('\n') });
      }
      i++;
    } else {
      // Skip non-code content outside testing sections
      if (inTestingSection) {
        // Check if this line is a condition
        const condition = parseCondition(line);
        if (condition) {
          blocks.push({ type: 'condition', content: condition });
          i++;
          continue;
        }

        const textLines = [line];
        i++;

        while (i < lines.length && !lines[i].match(/^```/) && !lines[i].match(/^#{1,6}\s+/) && !parseCondition(lines[i])) {
          textLines.push(lines[i]);
          i++;
        }

        const text = textLines.join('\n').trim();
        if (text) {
          blocks.push({ type: 'text', content: text });
        }
      } else {
        i++;
      }
    }
  }

  return blocks;
}

function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function runCode(lang, code) {
  return new Promise((resolve) => {
    const config = langConfig[lang];

    if (!config) {
      console.log(`${colors.yellow}⚠ Skipping: ${lang}${colors.reset}`);
      resolve({ success: true, skipped: true });
      return;
    }

    const proc = spawn(config.cmd, [...config.args, code], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
    });

    proc.stdout.on('data', (data) => process.stdout.write(data));
    proc.stderr.on('data', (data) => process.stderr.write(data));

    proc.on('close', (exitCode) => {
      resolve({ success: exitCode === 0, code: exitCode });
    });

    proc.on('error', (err) => {
      console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
      resolve({ success: false, error: err });
    });
  });
}

function printConditionSummary(conditionResults) {
  if (conditionResults.length === 0) return;

  console.log(`${colors.cyan}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}        Condition Summary${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════${colors.reset}\n`);

  const passed = conditionResults.filter(c => c.passed).length;
  const failed = conditionResults.filter(c => c.passed === false).length;
  const skipped = conditionResults.filter(c => c.passed === null).length;

  for (const result of conditionResults) {
    let status;
    if (result.passed === true) {
      status = `${colors.green}✓ PASS${colors.reset}`;
    } else if (result.passed === false) {
      status = `${colors.red}✗ FAIL${colors.reset}`;
    } else {
      status = `${colors.yellow}○ SKIP${colors.reset}`;
    }
    console.log(`  ${status}  ${result.condition}`);
  }

  console.log();
  console.log(`${colors.cyan}───────────────────────────────────${colors.reset}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}  ${colors.red}Failed: ${failed}${colors.reset}  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);
  console.log();
}

async function run(content, skipConfirm = false) {
  const blocks = parseMarkdown(content);

  if (blocks.length === 0) {
    console.log(`${colors.yellow}No "Testing" or "Tests" section found in the document.${colors.reset}`);
    console.log(`${colors.dim}Add a section like "## Testing" with code blocks to run.${colors.reset}`);
    return;
  }

  const codeBlocks = blocks.filter(b => b.type === 'code');

  if (codeBlocks.length === 0) {
    console.log(`${colors.yellow}No code blocks found in Testing section.${colors.reset}`);
    return;
  }

  console.log(`${colors.cyan}Found ${codeBlocks.length} code block(s) in Testing section.${colors.reset}\n`);
  console.log(`${colors.cyan}─────────────────────────────────${colors.reset}\n`);

  let codeBlockIndex = 0;
  let lastCodeBlockRan = false;
  const conditionResults = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      // Echo non-code content
      console.log(block.content);
      console.log();
    } else if (block.type === 'condition') {
      // Show the condition and ask if it passed
      console.log(`${colors.yellow}┌─ Condition ─────────────────────${colors.reset}`);
      console.log(`${colors.yellow}│${colors.reset} ${block.content}`);
      console.log(`${colors.yellow}└─────────────────────────────────${colors.reset}`);

      if (!lastCodeBlockRan) {
        console.log(`${colors.dim}(Code block was skipped, marking condition as skipped)${colors.reset}\n`);
        conditionResults.push({ condition: block.content, passed: null });
        continue;
      }

      const answer = await prompt(`${colors.yellow}Was this condition met? [y/N] ${colors.reset}`);
      const passed = answer === 'y' || answer === 'yes';

      if (passed) {
        console.log(`${colors.green}✓ Condition passed${colors.reset}\n`);
      } else {
        console.log(`${colors.red}✗ Condition failed${colors.reset}\n`);
      }

      conditionResults.push({ condition: block.content, passed });
    } else if (block.type === 'code') {
      codeBlockIndex++;
      lastCodeBlockRan = false;

      // Show the code block
      console.log(`${colors.cyan}┌─ [${codeBlockIndex}/${codeBlocks.length}] ${block.lang || 'code'} ─────────────────────${colors.reset}`);
      console.log(`${colors.dim}${block.content}${colors.reset}`);
      console.log(`${colors.cyan}└─────────────────────────────────${colors.reset}`);

      // Prompt to run this block
      if (!skipConfirm) {
        const answer = await prompt(`${colors.yellow}Run this block? [y/N/q] ${colors.reset}`);

        if (answer === 'q' || answer === 'quit') {
          console.log('Aborted.');
          printConditionSummary(conditionResults);
          return;
        }

        if (answer !== 'y' && answer !== 'yes') {
          console.log(`${colors.dim}Skipped.${colors.reset}\n`);
          continue;
        }
      }

      // Execute the block
      console.log(`${colors.cyan}├─ output ─────────────────────${colors.reset}`);
      const result = await runCode(block.lang, block.content);
      lastCodeBlockRan = true;

      if (!result.skipped) {
        if (result.success) {
          console.log(`${colors.cyan}└─ ${colors.green}✓ success${colors.reset}`);
        } else {
          console.log(`${colors.cyan}└─ ${colors.red}✗ failed (exit ${result.code})${colors.reset}`);
        }
      }
      console.log();
    }
  }

  printConditionSummary(conditionResults);
  console.log(`${colors.green}Done!${colors.reset}`);
}

function showHelp() {
  console.log(`${colors.cyan}prquicktest${colors.reset} - Run code blocks from GitHub PR descriptions

${colors.yellow}Usage:${colors.reset}
  prquicktest <pr-url>          Fetch PR and run code blocks
  prquicktest <file.md>         Run code blocks from a local file

${colors.yellow}Options:${colors.reset}
  -y, --yes                     Run all blocks without prompting
  -h, --help                    Show this help
  -v, --version                 Show version

${colors.yellow}Examples:${colors.reset}
  prquicktest https://github.com/owner/repo/pull/123
  prquicktest ./test-instructions.md
  prquicktest -y https://github.com/owner/repo/pull/123

${colors.yellow}How it works:${colors.reset}
  Only runs code blocks under a "Testing", "Tests", or "Test" header.
  The section ends when another header of equal or higher level appears.

${colors.yellow}Supported languages:${colors.reset}
  bash, sh, shell               Executed with bash -c
  javascript, js, node          Executed with node -e
  python, py, python3           Executed with python3 -c

Requires GitHub CLI (gh): https://cli.github.com
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const skipConfirm = args.includes('-y') || args.includes('--yes');
  const showHelpFlag = args.includes('-h') || args.includes('--help');
  const showVersionFlag = args.includes('-v') || args.includes('--version');

  // Get the target (non-flag argument)
  const target = args.find(a => !a.startsWith('-'));

  if (showHelpFlag || !target) {
    showHelp();
    process.exit(0);
  }

  if (showVersionFlag) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(pkg.version);
    process.exit(0);
  }

  let content;

  if (isGitHubPrUrl(target)) {
    content = fetchPrDescription(target);
  } else {
    try {
      content = readFileSync(target, 'utf-8');
    } catch (err) {
      console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
      process.exit(1);
    }
  }

  await run(content, skipConfirm);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
