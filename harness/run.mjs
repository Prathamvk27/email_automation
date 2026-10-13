#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGoodsendAgent } from '../goodsend-agent.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const flags = new Set(process.argv.slice(2).filter(value => value.startsWith('--')));
const valueAfter = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const live = flags.has('--live');
const baseUrl = (valueAfter('--base-url') || process.env.GOODSEND_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
const model = valueAfter('--model') || process.env.GOODSEND_MODEL || 'gpt-4o-mini';
const apiKey = process.env.GOODSEND_API_KEY || process.env.OPENAI_API_KEY;
const outputPath = resolve(repoRoot, valueAfter('--output') || `artifacts/goodsend-evals/${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`);
const suite = JSON.parse(await readFile(resolve(here, 'cases.json'), 'utf8'));
const startedAt = new Date().toISOString();

if (live && !apiKey) {
  console.error('Set GOODSEND_API_KEY (or OPENAI_API_KEY) before using --live.');
  process.exit(2);
}

const callLog = [];
async function requestCompletion(messages, temperature) {
  const started = performance.now();
  const stage = messages[1]?.content?.startsWith('TASK\nPrepare a short, evidence-only brief') ? 'fact_extraction' : 'draft_generation';
  let content;
  if (live) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Provider returned an empty completion.');
  } else {
    content = stage === 'fact_extraction'
      ? 'Offline fixture provider: supplied sender, contact, and role story facts only; no additional claims are supported.'
      : offlineDraft(messages);
  }
  callLog.push({ stage, latencyMs: Math.round(performance.now() - started) });
  return content;
}

function offlineDraft(messages) {
  const prompt = messages.at(-1)?.content || '';
  const contextPart = prompt.split('REFERENCE DATA (JSON):\n')[1]?.split('\n\nEVIDENCE BRIEF:')[0];
  const context = JSON.parse(contextPart || '{}');
  const cueWords = `${context.targetRole || ''} ${context.recipientContext || ''}`.toLocaleLowerCase().match(/[a-z]{4,}/g) || [];
  const story = (context.roleProfile || []).map(candidate => {
    const storyText = `${candidate.title} ${candidate.built} ${candidate.why} ${candidate.how}`.toLocaleLowerCase();
    return { candidate, score: cueWords.reduce((total, cue) => total + Number(storyText.includes(cue)), 0) };
  }).sort((left, right) => right.score - left.score)[0]?.candidate || {};
  const name = context.recipientName || 'there';
  const sender = context.senderName || 'I';
  const object = story.built || context.senderFocus || 'a project';
  const title = story.title ? ` for ${story.title}` : '';
  const whyText = story.why?.replace(/[.!?]+$/, '').replace(/^to\s+/i, '');
  const howText = story.how?.replace(/[.!?]+$/, '').replace(/^used\s+/i, 'using ');
  const why = whyText ? ` I wanted to ${whyText}.` : '';
  const how = howText ? ` I did that by ${howText}.` : '';
  const result = story.result ? ` The result was ${story.result.replace(/[.!?]+$/, '')}.` : '';
  const role = context.jobTitle || context.targetRole || 'the open role';
  const id = context.jobId ? ` (Job ID ${context.jobId})` : '';
  const body = `Hi ${name},\n\nI’m applying for ${role}${id}. ${context.jobDescription ? `The posting's focus on ${context.jobDescription.slice(0, 70).replace(/[.!?]+$/, '')} connects with my experience.` : `My background in ${context.senderFocus || role} is relevant to this work.`} I built ${object}${title}.${why}${how}${result} I’d appreciate your consideration. Would you be open to a brief conversation about my fit?\n\nBest,\n${sender}`;
  return JSON.stringify({ subject: `Application: ${role}${context.jobId ? ` · ${context.jobId}` : ''}`, body });
}

function grade(result, checks, caseCallCount) {
  const text = `${result.subject}\n${result.body}`.toLocaleLowerCase();
  const bodyWords = result.body.trim().split(/\s+/).filter(Boolean).length;
  const failures = [];
  if (caseCallCount !== 2) failures.push('expected_two_agent_steps');
  if (!result.facts.trim()) failures.push('empty_fact_sheet');
  for (const value of checks.required) if (!text.includes(value.toLocaleLowerCase())) failures.push(`missing_required:${value}`);
  for (const value of checks.forbidden) if (text.includes(value.toLocaleLowerCase())) failures.push(`contains_forbidden:${value}`);
  if (bodyWords < checks.minWords) failures.push('body_too_short');
  if (bodyWords > checks.maxWords) failures.push('body_too_long');
  return { passed: failures.length === 0, failures, bodyWords };
}

const caseResults = [];
for (const item of suite.cases) {
  const firstCall = callLog.length;
  try {
    const result = await runGoodsendAgent({
      context: item.context,
      styleInstruction: item.context.framingStyle === 'abigayle'
        ? 'For the single role profile story you chose, shape its project sentence in this order: what I built or did → why I did it → how I did it → result. Use only supplied fields; do not invent a result.'
        : undefined,
      requestCompletion
    });
    const checks = grade(result, item.checks, callLog.length - firstCall);
    caseResults.push({
      id: item.id,
      category: item.category,
      ...checks,
      facts: result.facts,
      subject: result.subject,
      body: result.body,
      latencyMs: callLog.slice(firstCall).reduce((sum, call) => sum + call.latencyMs, 0),
      steps: callLog.slice(firstCall)
    });
  } catch (error) {
    caseResults.push({ id: item.id, category: item.category, passed: false, failures: ['agent_error'], error: error.message, latencyMs: callLog.slice(firstCall).reduce((sum, call) => sum + call.latencyMs, 0) });
  }
}

const passed = caseResults.filter(item => item.passed).length;
const report = {
  schemaVersion: '1.0',
  suite: { id: suite.suite, version: suite.version, caseCount: suite.cases.length },
  run: { mode: live ? 'live' : 'offline-fixture', model: live ? model : 'offline-fixture', startedAt, finishedAt: new Date().toISOString() },
  summary: { passed, failed: caseResults.length - passed, passRate: passed / caseResults.length, completionCalls: callLog.length, factExtractionCalls: callLog.filter(call => call.stage === 'fact_extraction').length, draftGenerationCalls: callLog.filter(call => call.stage === 'draft_generation').length, totalLatencyMs: callLog.reduce((sum, call) => sum + call.latencyMs, 0) },
  cases: caseResults
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ mode: report.run.mode, model: report.run.model, ...report.summary, report: outputPath }));
process.exitCode = caseResults.every(item => item.passed) ? 0 : 1;
