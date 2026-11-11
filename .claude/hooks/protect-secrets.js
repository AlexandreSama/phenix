#!/usr/bin/env node
// Hook PreToolUse (Write|Edit|NotebookEdit) : refuse l'écriture dans des fichiers de secrets,
// et l'écriture d'un manifest YAML contenant un `kind: Secret` sans bloc `sops:`.
const fs = require('fs');

const SECRET_PATTERNS = [
  /(^|[\\/])\.env(\.[^\\/]*)?$/i, // .env, .env.local… (mais .env.example est autorisé plus bas)
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(^|[\\/])id_(rsa|ed25519|ecdsa)(\.pub)?$/i,
  /(^|[\\/])(credentials|secrets?)\.(json|ya?ml|toml)$/i,
  /\.agekey$/i, // clé privée age (SOPS)
  /(^|[\\/])age[\\/]keys\.txt$/i, // emplacement par défaut des clés age
  /(^|[\\/])kubeconfig(\.ya?ml)?$/i, // accès administrateur au cluster k3s
];
const ALLOWED = [/\.env\.(example|sample|template)$/i];
// Fixtures de tests des politiques : elles contiennent volontairement des Secrets en clair factices.
const PLAINTEXT_SECRET_ALLOWED = [/(^|[\\/])policies[\\/]/i];

const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

// Contenu du fichier tel qu'il sera après l'outil (Write : contenu complet ; Edit : remplacement appliqué).
function resultingContent(tool, input) {
  if (typeof input.content === 'string') return input.content;
  if (typeof input.new_string !== 'string') return null;
  let current = '';
  try {
    current = fs.readFileSync(input.file_path, 'utf8');
  } catch {
    return input.new_string;
  }
  const { old_string: oldStr = '', new_string: newStr, replace_all: all } = input;
  if (!oldStr) return newStr;
  return all ? current.split(oldStr).join(newStr) : current.replace(oldStr, () => newStr);
}

// Un document YAML `kind: Secret` doit porter un bloc `sops:` de premier niveau.
function hasPlaintextSecret(text) {
  return text
    .split(/^---\s*$/m)
    .some((doc) => /^kind:\s*["']?Secret["']?\s*$/m.test(doc) && !/^sops:/m.test(doc));
}

// Dépôt d'infra (exemple : `infra`) : état OpenTofu (contient des valeurs sensibles en clair) — jamais écrit par Claude.
const TOFU_STATE = /\.tfstate(\.backup|\.\d+\.backup)?$/i;

// Un fichier *.sops.(yaml|yml|json|env) doit être chiffré : bloc `sops` présent (YAML, JSON)
// ou variables `sops_*` (dotenv).
function isUnencryptedSopsFile(file, content) {
  if (!/\.sops\.(ya?ml|json|env)$/i.test(file) || typeof content !== 'string') return false;
  if (/\.env$/i.test(file)) return !/^sops_/m.test(content);
  if (/\.json$/i.test(file)) return !/"sops"\s*:/.test(content);
  return !/^sops:/m.test(content);
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }
  const ti = input.tool_input || {};
  const file = ti.file_path || ti.notebook_path || '';
  if (!file || ALLOWED.some((r) => r.test(file))) process.exit(0);
  if (SECRET_PATTERNS.some((r) => r.test(file))) {
    deny(
      `Écriture refusée dans un fichier de secrets (${file}). ` +
        "Demande à l'utilisateur de le modifier lui-même, ou utilise un fichier .env.example.",
    );
  }
  if (TOFU_STATE.test(file)) {
    deny(
      `Écriture refusée : ${file} est un état OpenTofu. Il est géré par \`tofu\` lui-même ` +
        '(backend distant chiffré), jamais édité ni commité.',
    );
  }
  if (isUnencryptedSopsFile(file, resultingContent(input.tool_name, ti))) {
    deny(
      `Écriture refusée : ${file} serait un fichier SOPS non chiffré. ` +
        "C'est l'utilisateur qui saisit les valeurs avec `sops <fichier>` (skill /rotation-secret).",
    );
  }
  if (/\.ya?ml$/i.test(file) && !PLAINTEXT_SECRET_ALLOWED.some((r) => r.test(file))) {
    const content = resultingContent(input.tool_name, ti);
    if (content && hasPlaintextSecret(content)) {
      deny(
        `Écriture refusée : ${file} contiendrait un Secret Kubernetes en clair (pas de bloc sops:). ` +
          "Les secrets se créent chiffrés avec sops (skill /secret) ; c'est l'utilisateur qui saisit les valeurs.",
      );
    }
  }
  process.exit(0);
});
