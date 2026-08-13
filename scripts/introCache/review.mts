/**
 * Human-review gate for the intro cache.
 *
 * Reads every draft in intro-cache-drafts/ and, for each, prints the full
 * artifact then asks the reviewer to approve, reject, or skip. Approved
 * artifacts are promoted to public/intro-cache/<caseId>.json with
 * review.status = 'approved' and reviewer credentials stamped in.
 *
 * The runtime loader refuses any file whose review.status is not 'approved',
 * so nothing an educator has not signed off on will ever render to a learner.
 *
 * Usage:
 *   npx tsx scripts/introCache/review.mts                # walk every draft interactively
 *   npx tsx scripts/introCache/review.mts --case=<id>    # only this one draft
 *   REVIEWER_NAME="James Weatherhead" REVIEWER_CREDS="MD, PhD candidate" \
 *     npx tsx scripts/introCache/review.mts --auto-approve --case=cxr-pneumothorax
 *
 * The --auto-approve flag is a headless path for CI or for the author who
 * generated the draft; it still requires REVIEWER_NAME and REVIEWER_CREDS,
 * still validates the schema, and still records the reviewer identity. It
 * never bypasses the schema-level per-level guarantee.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { validateIntroCacheV1, type IntroCacheV1 } from '../../src/core/introCache';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const draftsDir = path.join(repoRoot, 'intro-cache-drafts');
const publicDir = path.join(repoRoot, 'public', 'intro-cache');

interface CliOptions {
  caseIds: string[] | 'all';
  autoApprove: boolean;
}

function parseCli(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    caseIds: 'all',
    autoApprove: false,
  };
  for (const arg of argv) {
    if (arg === '--auto-approve') options.autoApprove = true;
    else if (arg.startsWith('--case=')) {
      const id = arg.slice('--case='.length).trim();
      if (id.length > 0) {
        if (options.caseIds === 'all') options.caseIds = [id];
        else options.caseIds.push(id);
      }
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  return options;
}

function printUsageAndExit(code: number): never {
  console.log(
    [
      'Usage:',
      '  npx tsx scripts/introCache/review.mts                    # walk every draft',
      '  npx tsx scripts/introCache/review.mts --case=<caseId>    # one draft',
      '  REVIEWER_NAME="..." REVIEWER_CREDS="..." \\',
      '    npx tsx scripts/introCache/review.mts --auto-approve --case=<caseId>',
    ].join('\n'),
  );
  process.exit(code);
}

async function readDraft(caseId: string): Promise<IntroCacheV1> {
  const raw = await readFile(path.join(draftsDir, `${caseId}.json`), 'utf8');
  const parsed = JSON.parse(raw);
  const validation = validateIntroCacheV1(parsed);
  if (!validation.valid) {
    throw new Error(
      `Draft for '${caseId}' failed schema validation. Reject and regenerate.\n  - ${validation.errors.join('\n  - ')}`,
    );
  }
  const artifact = parsed as IntroCacheV1;
  if (artifact.review.status !== 'draft') {
    throw new Error(`Draft file for '${caseId}' is not in status 'draft' (found '${artifact.review.status}').`);
  }
  return artifact;
}

async function listDraftCaseIds(): Promise<string[]> {
  try {
    const entries = await readdir(draftsDir);
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function printDraft(artifact: IntroCacheV1): void {
  const bar = '='.repeat(72);
  console.log('\n' + bar);
  console.log(`Case:              ${artifact.caseId}`);
  console.log(`Model:             ${artifact.provenance.modelId}`);
  console.log(`Generated:         ${artifact.provenance.generatedAt}`);
  console.log(`Lesson SHA:        ${artifact.lessonPlanSha256}`);
  console.log(`Media SHA:         ${artifact.provenance.mediaSha}`);
  console.log(`System prompt SHA: ${artifact.provenance.systemPromptSha256}`);
  console.log(bar);
  for (const [level, entry] of Object.entries(artifact.levels)) {
    console.log(`\n--- ${level} ---`);
    console.log('introPrompt:');
    console.log(entry.introPrompt);
    entry.introQuestions.forEach((q, index) => {
      console.log(`\nQ${index + 1} (${q.id}) [${q.label}]`);
      console.log(`  prompt:       ${q.prompt}`);
      console.log(`  cachedAnswer:`);
      console.log(indent(q.cachedAnswer, 4));
    });
  }
  console.log('\n' + bar);
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => pad + line).join('\n');
}

interface ReviewerIdentity {
  name: string;
  credentials: string;
}

async function ensureDirs(): Promise<void> {
  await mkdir(publicDir, { recursive: true });
}

async function promoteToApproved(
  artifact: IntroCacheV1,
  reviewer: ReviewerIdentity,
): Promise<void> {
  const approved: IntroCacheV1 = {
    ...artifact,
    review: {
      status: 'approved',
      reviewer: reviewer.name,
      credentials: reviewer.credentials,
      reviewedAt: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
    },
  };
  const validation = validateIntroCacheV1(approved);
  if (!validation.valid) {
    throw new Error(`Approved artifact failed schema validation: ${validation.errors.join(', ')}`);
  }
  const filePath = path.join(publicDir, `${artifact.caseId}.json`);
  await writeFile(filePath, JSON.stringify(approved, null, 2) + '\n', 'utf8');
}

function readerFromStdin(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
}

async function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function interactiveReview(
  artifacts: IntroCacheV1[],
  reviewer: ReviewerIdentity,
): Promise<{ approved: number; rejected: number; skipped: number }> {
  const rl = readerFromStdin();
  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  try {
    for (const artifact of artifacts) {
      printDraft(artifact);
      // Reviewer commits an action. Default is 'skip' so a stray Enter does not
      // silently ship unreviewed content.
      const answer = (await ask(rl, `Approve, reject, or skip ${artifact.caseId}? [a/r/s] (default s): `)).toLowerCase();
      if (answer === 'a' || answer === 'approve') {
        await promoteToApproved(artifact, reviewer);
        approved += 1;
        console.log(`  → approved and written to public/intro-cache/${artifact.caseId}.json`);
      } else if (answer === 'r' || answer === 'reject') {
        rejected += 1;
        console.log('  → left as draft. Regenerate or edit before re-running review.');
      } else {
        skipped += 1;
        console.log('  → skipped.');
      }
    }
  } finally {
    rl.close();
  }
  return { approved, rejected, skipped };
}

async function autoApproveAll(
  artifacts: IntroCacheV1[],
  reviewer: ReviewerIdentity,
): Promise<{ approved: number; rejected: number; skipped: number }> {
  let approved = 0;
  for (const artifact of artifacts) {
    printDraft(artifact);
    await promoteToApproved(artifact, reviewer);
    approved += 1;
    console.log(`  → auto-approved and written to public/intro-cache/${artifact.caseId}.json`);
  }
  return { approved, rejected: 0, skipped: 0 };
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const availableIds = await listDraftCaseIds();
  const targetIds = options.caseIds === 'all'
    ? availableIds
    : options.caseIds.filter((id) => availableIds.includes(id));
  if (targetIds.length === 0) {
    console.log(`No matching drafts found under ${path.relative(repoRoot, draftsDir)}/.`);
    return;
  }

  const reviewerName = (process.env.REVIEWER_NAME ?? '').trim();
  const reviewerCreds = (process.env.REVIEWER_CREDS ?? '').trim();
  if (!reviewerName || !reviewerCreds) {
    console.error(
      'REVIEWER_NAME and REVIEWER_CREDS must be set in the environment so approvals are auditable. Aborting.',
    );
    process.exit(1);
  }
  const reviewer: ReviewerIdentity = { name: reviewerName, credentials: reviewerCreds };

  const artifacts: IntroCacheV1[] = [];
  for (const caseId of targetIds) {
    try {
      artifacts.push(await readDraft(caseId));
    } catch (error) {
      console.error(`Skipping ${caseId}: ${(error as Error).message}`);
    }
  }
  if (artifacts.length === 0) {
    console.log('No valid drafts remaining after schema validation. Regenerate first.');
    process.exit(2);
  }

  await ensureDirs();
  const summary = options.autoApprove
    ? await autoApproveAll(artifacts, reviewer)
    : await interactiveReview(artifacts, reviewer);
  console.log(
    `\nReview complete. Approved ${summary.approved}, rejected ${summary.rejected}, skipped ${summary.skipped}.`,
  );
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
