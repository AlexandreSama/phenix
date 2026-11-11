#!/usr/bin/env node
// Vérifie que l'architecture Claude Code est valide (JSON, agents, skills, hooks, barème).
// Utilisable en CI et en local : node .claude/ci/check-config.js [racine]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(process.argv[2] || process.cwd());
const errors = [];
const ok = (msg) => console.log(`  ok  ${msg}`);
const fail = (msg) => { errors.push(msg); console.log(`  KO  ${msg}`); };
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');

const MODELS = ['haiku', 'sonnet', 'opus', 'fable'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const EFFORTS_BY_MODEL = { haiku: ['low', 'medium', 'high'], sonnet: ['low', 'medium', 'high'] };

function checkJson(file, required) {
  if (!fs.existsSync(file)) return required ? fail(`${rel(file)} manquant`) : undefined;
  try { JSON.parse(fs.readFileSync(file, 'utf8')); ok(`${rel(file)} : JSON valide`); }
  catch (e) { fail(`${rel(file)} : JSON invalide (${e.message})`); }
}

function frontmatter(file) {
  const m = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// Caractères invisibles ou de contrôle (hors tabulation et fins de ligne) : position et code.
const INVISIBLE_RANGES = [[0x0,0x8],[0xB,0xC],[0xE,0x1F],[0x7F,0x7F],[0xAD,0xAD],[0x200B,0x200F],[0x202A,0x202E],[0x2060,0x2064],[0x2066,0x2069],[0xFEFF,0xFEFF],[0xE0000,0xE007F]];
const INVISIBLE = { test: (ch) => { const c = ch.codePointAt(0); return INVISIBLE_RANGES.some(([a, b]) => c >= a && c <= b); } };
function findInvisible(text) {
  const hits = [];
  String(text).split('\n').forEach((line, i) => {
    for (const ch of line) {
      if (INVISIBLE.test(ch)) hits.push({ line: i + 1, code: ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') });
    }
  });
  return hits;
}

function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

console.log(`Contrôle de l'architecture Claude Code dans ${root}`);

// CLAUDE.md
const claudeMd = path.join(root, 'CLAUDE.md');
const claudeText = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : null;
if (claudeText === null) fail('CLAUDE.md manquant');
else if (claudeText.includes('{{')) fail('CLAUDE.md contient encore des {{…}} non remplis');
else ok('CLAUDE.md présent et rempli');

// Fichiers d'instructions des agents : aucun caractère Unicode invisible (injection indirecte
// « rules file backdoor » : jointures de largeur nulle, marqueurs bidirectionnels, bloc Tags…)
{
  const cp = (...c) => String.fromCodePoint(...c);
  const selfTest = [[`a${cp(0x200B)}b`, true], [`x${cp(0x202E)}y`, true], [cp(0xE0041), true], ['é à ç « » — ✓ œ', false]];
  if (selfTest.some(([s, expected]) => (findInvisible(s).length > 0) !== expected)) fail('détecteur de caractères invisibles défaillant');
  const targets = [];
  const addIf = (p) => { if (fs.existsSync(p)) targets.push(p); };
  addIf(claudeMd); addIf(path.join(root, '.mcp.json')); addIf(path.join(root, '.gitlab-ci.yml'));
  (function walk(dir) {
    for (const e of listDir(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|js|json|ya?ml|sh)$/i.test(e.name)) targets.push(p);
    }
  })(path.join(root, '.claude'));
  const hits = targets.flatMap((p) => findInvisible(fs.readFileSync(p, 'utf8')).map((h) => `${rel(p)}:${h.line} (U+${h.code})`));
  if (hits.length) fail(`caractères Unicode invisibles dans les instructions des agents : ${hits.slice(0, 10).join(', ')}`);
  else ok(`aucun caractère invisible dans ${targets.length} fichiers d'instructions`);
}

// Politique qualité (courte, stable, commune à tous les dépôts)
const policy = path.join(root, '.claude', 'politique-qualite.md');
if (!fs.existsSync(policy)) fail('.claude/politique-qualite.md manquant');
else if (claudeText !== null && !claudeText.includes('@.claude/politique-qualite.md')) fail('CLAUDE.md n\'importe pas @.claude/politique-qualite.md');
else ok('politique qualité importée par CLAUDE.md');

// Référentiel de nommage (commun à tous les dépôts)
const naming = path.join(root, '.claude', 'conventions-nommage.md');
if (!fs.existsSync(naming)) fail('.claude/conventions-nommage.md manquant');
else if (claudeText !== null && !claudeText.includes('@.claude/conventions-nommage.md')) fail('CLAUDE.md n\'importe pas @.claude/conventions-nommage.md');
else ok('référentiel de nommage importé par CLAUDE.md');
{
  const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const bad = [];
  for (const e of listDir(path.join(root, '.claude', 'agents'))) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    const base = e.name.slice(0, -3);
    const fm = frontmatter(path.join(root, '.claude', 'agents', e.name)) || {};
    if (!kebab.test(base)) bad.push(`agent ${e.name} (pas en minuscules-avec-tirets)`);
    else if (fm.name && fm.name !== base) bad.push(`agent ${e.name} (name: ${fm.name} ≠ nom du fichier)`);
  }
  for (const e of listDir(path.join(root, '.claude', 'skills'))) {
    if (e.isDirectory() && !kebab.test(e.name)) bad.push(`skill ${e.name} (pas en minuscules-avec-tirets)`);
  }
  if (bad.length) fail(`nommage : ${bad.join(', ')}`);
  else ok('nommage des agents et des skills conforme');
}

// Barème de routage des modèles (orchestration)
const routing = path.join(root, '.claude', 'routage-modeles.md');
if (!fs.existsSync(routing)) fail('.claude/routage-modeles.md manquant');
else if (claudeText !== null && !claudeText.includes('@.claude/routage-modeles.md')) fail('CLAUDE.md n\'importe pas @.claude/routage-modeles.md');
else ok('barème de routage des modèles importé par CLAUDE.md');

// Mode orchestrateur par défaut : hook SessionStart branché + modèle/effort de la session principale
const orchestratorHook = path.join(root, '.claude', 'hooks', 'orchestrateur.js');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')); } catch { /* signalé plus bas */ }
const sessionStart = ((settings.hooks || {}).SessionStart || []).flatMap((m) => m.hooks || []);
if (!fs.existsSync(orchestratorHook)) fail('.claude/hooks/orchestrateur.js manquant');
else if (!sessionStart.some((h) => /orchestrateur\.js/.test(h.command || ''))) fail('settings.json : hook SessionStart orchestrateur.js non branché');
else if (!MODELS.includes(settings.model) || !['low', 'medium', 'high', 'xhigh'].includes(settings.effortLevel)) fail('settings.json : model / effortLevel de la session principale absents ou invalides');
else {
  try {
    const out = JSON.parse(execFileSync(process.execPath, [orchestratorHook], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
    }).toString());
    const ctx = ((out.hookSpecificOutput || {}).additionalContext || '');
    if (!ctx.includes('routage-modeles.md') || !ctx.includes('/orchestrer')) fail('hook orchestrateur : contexte injecté incomplet');
    else ok(`mode orchestrateur par défaut (session principale : ${settings.model}, ${settings.effortLevel})`);
  } catch (e) { fail(`hook orchestrateur : erreur d'exécution ou sortie invalide (${e.message})`); }
}

// JSON
checkJson(path.join(root, '.claude', 'settings.json'), true);
checkJson(path.join(root, '.mcp.json'), false);

// Agents : name, description, model et effort explicites et valides
const agentsDir = path.join(root, '.claude', 'agents');
const agents = listDir(agentsDir).filter((e) => e.isFile() && e.name.endsWith('.md'));
if (agents.length === 0) fail('.claude/agents/ : aucun agent');
for (const a of agents) {
  const fm = frontmatter(path.join(agentsDir, a.name));
  if (!fm || !fm.name || !fm.description) { fail(`agent ${a.name} : frontmatter name/description manquant`); continue; }
  if (!MODELS.includes(fm.model)) { fail(`agent ${fm.name} : model « ${fm.model || ''} » invalide (attendu ${MODELS.join('|')})`); continue; }
  const allowed = EFFORTS_BY_MODEL[fm.model] || EFFORTS;
  if (!allowed.includes(fm.effort)) { fail(`agent ${fm.name} : effort « ${fm.effort || ''} » invalide pour ${fm.model} (attendu ${allowed.join('|')})`); continue; }
  ok(`agent ${fm.name} (${fm.model}, ${fm.effort})`);
}

// Skills
const skillsDir = path.join(root, '.claude', 'skills');
const skills = listDir(skillsDir).filter((e) => e.isDirectory());
if (skills.length === 0) fail('.claude/skills/ : aucun skill');
for (const s of skills) {
  const f = path.join(skillsDir, s.name, 'SKILL.md');
  if (!fs.existsSync(f)) { fail(`skill ${s.name} : SKILL.md manquant`); continue; }
  const fm = frontmatter(f);
  if (!fm || !fm.description) fail(`skill ${s.name} : frontmatter description manquant`);
  else ok(`skill /${s.name}`);
}
if (!fs.existsSync(path.join(skillsDir, 'orchestrer', 'SKILL.md'))) fail('skill /orchestrer manquant');

// Hooks : chaque script branché dans settings.json existe
{
  const missing = [];
  for (const groups of Object.values(settings.hooks || {})) {
    for (const g of groups) {
      for (const h of g.hooks || []) {
        const m = String(h.command || '').match(/\.claude\/hooks\/[\w.-]+\.js/);
        if (m && !fs.existsSync(path.join(root, m[0]))) missing.push(m[0]);
      }
    }
  }
  if (missing.length) fail(`hooks branchés mais absents : ${missing.join(', ')}`);
  else ok('hooks branchés dans settings.json : scripts présents');
}

// Barème : chaque agent apparaît dans routage-modeles.md
if (fs.existsSync(routing)) {
  const table = fs.readFileSync(routing, 'utf8');
  const absent = agents.map((a) => a.name.slice(0, -3)).filter((n) => !table.includes('`' + n + '`'));
  if (absent.length) fail(`routage-modeles.md : agents absents du barème : ${absent.join(', ')}`);
  else ok('tous les agents figurent dans le barème de routage');
}

if (errors.length) {
  console.log(`\n${errors.length} problème(s).`);
  process.exit(1);
}
console.log('\nArchitecture Claude Code valide.');
