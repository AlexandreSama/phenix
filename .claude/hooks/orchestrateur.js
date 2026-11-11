#!/usr/bin/env node
// Hook SessionStart (démarrage, reprise, /clear, compaction) : met la session principale en
// mode orchestrateur. Fichier identique.
// On garde le prompt système normal de Claude Code (le réglage « agent » le remplacerait) et
// on ajoute seulement le rôle d'orchestrateur au contexte.

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    /* entrée vide : démarrage */
  }
  const source = input.source || 'startup';

  const context = [
    'MODE ORCHESTRATEUR (règle du projet, à appliquer pendant toute la session).',
    "Tu es l'orchestrateur : pour toute tâche qui demande plusieurs étapes ou plusieurs agents,",
    "suis le skill /orchestrer — découpe la tâche, choisis pour chaque étape l'agent, le modèle",
    "et l'effort selon .claude/routage-modeles.md (importé par CLAUDE.md), montre le plan sous",
    'forme de tableau (# | étape | agent | modèle | effort | pourquoi), exécute, rends compte.',
    "Ce barème t'autorise explicitement à passer `model` et `effort` à l'outil Agent.",
    'Rappels : plancher opus pour sécurité, secrets, données personnelles et production ; au plus deux escalades',
    "sans en parler à l'utilisateur ; fable toujours annoncé avant l'appel ; une petite tâche",
    "(lecture, modification d'une ligne) se fait directement, sans sous-agent.",
    "Au moindre doute, pose la question à l'utilisateur avec l'outil de questions (option",
    'recommandée en premier, justifiée) au lieu de trancher seul ; propose aussi des idées',
    "d'amélioration justifiées — il dira si elles ne l'intéressent pas.",
  ].join('\n');

  const out = {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  };
  // Message visible seulement au démarrage, pour ne pas encombrer les reprises et compactions.
  if (source === 'startup') {
    out.systemMessage =
      'Mode orchestrateur actif : agents, modèles et effort choisis selon .claude/routage-modeles.md (/orchestrer).';
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
});
