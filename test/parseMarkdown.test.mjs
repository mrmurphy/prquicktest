import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import the parsing functions by extracting them
// For now, we'll duplicate the logic here for testing, then refactor

function isTestingHeader(line) {
  const match = line.match(/^(#{1,6})\s+(.+)/);
  if (!match) return null;

  const level = match[1].length;
  const title = match[2].trim().toLowerCase();

  if (/^test(?:ing|s)?(?:\s+\w+)?$/.test(title)) {
    return { level, title: match[2].trim() };
  }
  return null;
}

function getHeaderLevel(line) {
  const match = line.match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

function parseCondition(line) {
  const match = line.match(/^(condition|check\s*for|check)\s*:\s*(.+)/i);
  if (match) {
    return match[2].trim();
  }
  return null;
}

function parseMarkdown(content) {
  const blocks = [];
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let inTestingSection = false;
  let testingSectionLevel = null;

  while (i < lines.length) {
    const line = lines[i];

    const testingHeader = isTestingHeader(line);
    const headerLevel = getHeaderLevel(line);

    if (testingHeader) {
      inTestingSection = true;
      testingSectionLevel = testingHeader.level;
      blocks.push({ type: 'text', content: line });
      i++;
      continue;
    } else if (headerLevel !== null && inTestingSection) {
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

      if (inTestingSection) {
        blocks.push({ type: 'code', lang: lang.toLowerCase(), content: codeLines.join('\n') });
      }
      i++;
    } else {
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

// Helper to get just code blocks
function getCodeBlocks(content) {
  return parseMarkdown(content).filter(b => b.type === 'code');
}

// Helper to get just condition blocks
function getConditions(content) {
  return parseMarkdown(content).filter(b => b.type === 'condition');
}

describe('parseMarkdown', () => {
  describe('basic section detection', () => {
    it('should find code blocks under ## Testing', () => {
      const md = `## Testing
\`\`\`bash
echo "test"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].content, 'echo "test"');
    });

    it('should find code blocks under ## Tests', () => {
      const md = `## Tests
\`\`\`bash
npm test
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
    });

    it('should find code blocks under ## Test', () => {
      const md = `## Test
\`\`\`bash
npm test
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
    });

    it('should work with any header level', () => {
      const levels = ['#', '##', '###', '####', '#####', '######'];
      for (const level of levels) {
        const md = `${level} Testing
\`\`\`bash
echo "level ${level.length}"
\`\`\``;
        const blocks = getCodeBlocks(md);
        assert.strictEqual(blocks.length, 1, `Failed for header level ${level.length}`);
      }
    });
  });

  describe('ignoring non-testing sections', () => {
    it('should ignore code blocks before Testing section', () => {
      const md = `## Summary
\`\`\`bash
echo "ignored"
\`\`\`

## Testing
\`\`\`bash
echo "included"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].content, 'echo "included"');
    });

    it('should ignore code blocks after Testing section ends', () => {
      const md = `## Testing
\`\`\`bash
echo "included"
\`\`\`

## Deployment
\`\`\`bash
echo "ignored"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].content, 'echo "included"');
    });

    it('should ignore code blocks in unrelated sections', () => {
      const md = `## Summary
\`\`\`bash
echo "summary"
\`\`\`

## Implementation
\`\`\`javascript
console.log("impl");
\`\`\`

## Notes
\`\`\`python
print("notes")
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 0);
    });
  });

  describe('section boundaries', () => {
    it('should end Testing section at same-level header', () => {
      const md = `## Testing
\`\`\`bash
echo "in testing"
\`\`\`

## Other
\`\`\`bash
echo "not in testing"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].content, 'echo "in testing"');
    });

    it('should end Testing section at higher-level header', () => {
      const md = `### Testing
\`\`\`bash
echo "in testing"
\`\`\`

## Higher Level
\`\`\`bash
echo "not in testing"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
    });

    it('should NOT end Testing section at lower-level header', () => {
      const md = `## Testing
\`\`\`bash
echo "first"
\`\`\`

### Sub-section
\`\`\`bash
echo "second"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 2);
    });

    it('should include nested subsections in Testing', () => {
      const md = `## Testing

### Unit Tests
\`\`\`bash
npm run test:unit
\`\`\`

### Integration Tests
\`\`\`bash
npm run test:integration
\`\`\`

## Deployment`;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 2);
    });
  });

  describe('multiple testing sections', () => {
    it('should find code blocks in multiple Testing sections', () => {
      const md = `## Testing
\`\`\`bash
echo "first"
\`\`\`

## Other Stuff

## Testing
\`\`\`bash
echo "second"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 2);
    });
  });

  describe('language detection', () => {
    it('should detect bash language', () => {
      const md = `## Testing
\`\`\`bash
echo "test"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks[0].lang, 'bash');
    });

    it('should detect javascript language', () => {
      const md = `## Testing
\`\`\`javascript
console.log("test");
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks[0].lang, 'javascript');
    });

    it('should handle code blocks without language', () => {
      const md = `## Testing
\`\`\`
some code
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks[0].lang, '');
    });
  });

  describe('edge cases', () => {
    it('should return empty array when no Testing section exists', () => {
      const md = `## Summary
Some text

## Implementation
\`\`\`bash
echo "code"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 0);
    });

    it('should return empty array for empty document', () => {
      const blocks = getCodeBlocks('');
      assert.strictEqual(blocks.length, 0);
    });

    it('should handle Testing section with no code blocks', () => {
      const md = `## Testing
Just some instructions, no code.

## Other`;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 0);
    });

    it('should match "Testing Instructions" header', () => {
      const md = `## Testing Instructions\n\`\`\`bash\necho "test"\n\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
    });

    it('should match "Test Plan" header', () => {
      const md = `## Test Plan\n\`\`\`bash\necho "test"\n\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
    });

    it('should match "Testing Steps" and "Tests Summary"', () => {
      for (const header of ['Testing Steps', 'Tests Summary', 'Test Procedure']) {
        const md = `## ${header}\n\`\`\`bash\necho "test"\n\`\`\``;
        const blocks = getCodeBlocks(md);
        assert.strictEqual(blocks.length, 1, `Failed for header: ${header}`);
      }
    });

    it('should NOT match headers with more than one extra word', () => {
      const md = `## Testing All The Things\n\`\`\`bash\necho "test"\n\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 0);
    });

    it('should handle \\r\\n line endings in code blocks', () => {
      const md = "## Testing\r\n\`\`\`bash\r\ncurl -s -X POST http://example.com \\\r\n  -H \"Authorization: token\"\r\n\`\`\`\r\n";
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 1);
      assert.ok(!blocks[0].content.includes('\r'), 'should not contain \\r');
      assert.ok(blocks[0].content.includes('\\\n'), 'should preserve line continuation');
    });

    it('should be case-insensitive for section headers', () => {
      const variants = ['Testing', 'TESTING', 'testing', 'TeStiNg'];
      for (const variant of variants) {
        const md = `## ${variant}
\`\`\`bash
echo "test"
\`\`\``;
        const blocks = getCodeBlocks(md);
        assert.strictEqual(blocks.length, 1, `Failed for variant: ${variant}`);
      }
    });

    it('should handle multiline code blocks', () => {
      const md = `## Testing
\`\`\`bash
echo "line 1"
echo "line 2"
echo "line 3"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks[0].content, 'echo "line 1"\necho "line 2"\necho "line 3"');
    });

    it('should handle code blocks with blank lines', () => {
      const md = `## Testing
\`\`\`bash
echo "before"

echo "after"
\`\`\``;
      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks[0].content, 'echo "before"\n\necho "after"');
    });
  });

  describe('realistic PR descriptions', () => {
    it('should parse a typical PR format', () => {
      const md = `# Add user authentication

## Summary
This PR implements JWT-based authentication.

## Changes
- Added login endpoint
- Added middleware

\`\`\`javascript
// Example usage (not run)
const token = await login(user, pass);
\`\`\`

## Testing

Run the test suite:

\`\`\`bash
npm test
\`\`\`

Verify the endpoint manually:

\`\`\`bash
curl -X POST http://localhost:3000/login
\`\`\`

## Deployment
Deploy to staging first.`;

      const blocks = getCodeBlocks(md);
      assert.strictEqual(blocks.length, 2);
      assert.strictEqual(blocks[0].content, 'npm test');
      assert.ok(blocks[1].content.includes('curl'));
    });
  });

  describe('condition parsing', () => {
    it('should parse "condition:" lines', () => {
      const md = `## Testing
\`\`\`bash
echo "test"
\`\`\`
condition: Output should show "test"`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 1);
      assert.strictEqual(conditions[0].content, 'Output should show "test"');
    });

    it('should parse "check:" lines', () => {
      const md = `## Testing
\`\`\`bash
curl http://localhost
\`\`\`
check: Response contains JSON`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 1);
      assert.strictEqual(conditions[0].content, 'Response contains JSON');
    });

    it('should parse "check for:" lines', () => {
      const md = `## Testing
\`\`\`bash
npm test
\`\`\`
check for: All tests passing`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 1);
      assert.strictEqual(conditions[0].content, 'All tests passing');
    });

    it('should be case-insensitive', () => {
      const md = `## Testing
\`\`\`bash
echo "1"
\`\`\`
CONDITION: First condition
\`\`\`bash
echo "2"
\`\`\`
Check: Second condition
\`\`\`bash
echo "3"
\`\`\`
CHECK FOR: Third condition`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 3);
      assert.strictEqual(conditions[0].content, 'First condition');
      assert.strictEqual(conditions[1].content, 'Second condition');
      assert.strictEqual(conditions[2].content, 'Third condition');
    });

    it('should handle multiple conditions after a code block', () => {
      const md = `## Testing
\`\`\`bash
curl http://api/users
\`\`\`
check: Returns 200 status
check: Response is valid JSON
check: Contains user array`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 3);
    });

    it('should preserve block order', () => {
      const md = `## Testing
Some intro text
\`\`\`bash
echo "test"
\`\`\`
condition: Check the output
More text here`;
      const blocks = parseMarkdown(md);
      assert.strictEqual(blocks[0].type, 'text');
      assert.strictEqual(blocks[1].type, 'text');
      assert.strictEqual(blocks[2].type, 'code');
      assert.strictEqual(blocks[3].type, 'condition');
      assert.strictEqual(blocks[4].type, 'text');
    });

    it('should not parse conditions outside Testing section', () => {
      const md = `## Summary
condition: This should be ignored

## Testing
\`\`\`bash
echo "test"
\`\`\`
condition: This should be parsed`;
      const conditions = getConditions(md);
      assert.strictEqual(conditions.length, 1);
      assert.strictEqual(conditions[0].content, 'This should be parsed');
    });
  });
});
