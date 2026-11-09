import { REST, Routes } from 'discord.js';
import { commands, ownerCommands } from '../commands.js';
import { loadEnv } from '../env.js';

/**
 * Enregistre les slash commands auprès de Discord.
 *   (sans option)   toutes les commandes sur le serveur de test : visibles tout de suite
 *   --global        sur tous les serveurs ; les commandes des propriétaires (/broadcast)
 *                   restent sur le serveur de test
 *   --clear-dev     retire les commandes du serveur de test
 */
const env = loadEnv();
const args = new Set(process.argv.slice(2));
const rest = new REST().setToken(env.DISCORD_TOKEN);
const toJson = (list: typeof commands) => list.map((command) => command.data.toJSON());

async function putOnDevGuild(body: ReturnType<typeof toJson>): Promise<void> {
  if (!env.DISCORD_DEV_GUILD_ID) {
    console.error('DISCORD_DEV_GUILD_ID manque dans .env : il faut un serveur de test.');
    process.exit(1);
  }
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_DEV_GUILD_ID), {
    body,
  });
}

if (args.has('--global')) {
  const body = toJson(commands);
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
  console.log(`${body.length} commandes enregistrées sur tous les serveurs.`);
  // Le serveur de test ne garde que les commandes des propriétaires : pas de doublons
  await putOnDevGuild(toJson(ownerCommands));
  console.log(`${ownerCommands.length} commande(s) des propriétaires sur le serveur de test.`);
} else if (args.has('--clear-dev')) {
  await putOnDevGuild([]);
  console.log('Commandes du serveur de test retirées.');
} else {
  const body = toJson([...commands, ...ownerCommands]);
  await putOnDevGuild(body);
  console.log(`${body.length} commandes enregistrées sur le serveur de test.`);
}
