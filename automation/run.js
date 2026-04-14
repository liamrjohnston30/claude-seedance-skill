// run.js — CLI entry point invoked by the Claude Code skill.
//
// Usage:
//   node run.js --prompt "cinematic..." [--image references/hero.png] [--out outputs]
//
// The skill constructs this command from the user's request and invokes it via Bash.

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drive } from './higgsfield.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const argv = yargs(hideBin(process.argv))
  .option('prompt', {
    alias: 'p',
    type: 'string',
    demandOption: true,
    describe: 'Seedance 2.0 motion prompt (see prompt-architecture.md)',
  })
  .option('image', {
    alias: 'i',
    type: 'string',
    describe: 'Path to reference image (absolute or relative to project root)',
  })
  .option('out', {
    alias: 'o',
    type: 'string',
    default: 'outputs',
    describe: 'Output directory (relative to project root)',
  })
  .option('headless', {
    type: 'boolean',
    default: false,
    describe: 'Run Chromium headlessly (default: false — we want to see it)',
  })
  .strict()
  .parse();

const imagePath = argv.image
  ? path.isAbsolute(argv.image) ? argv.image : path.join(PROJECT_ROOT, argv.image)
  : null;
const outputDir = path.isAbsolute(argv.out) ? argv.out : path.join(PROJECT_ROOT, argv.out);

try {
  const result = await drive({
    prompt: argv.prompt,
    imagePath,
    outputDir,
    headless: argv.headless,
  });
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('✗ Automation failed:', err.message);
  console.error(err.stack);
  process.exit(1);
}
