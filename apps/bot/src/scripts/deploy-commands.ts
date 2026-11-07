import { REST, Routes } from 'discord.js';
import { commands } from '../commands.js';
import { loadEnv } from '../env.js';

/**
 * Enregistre les slash commands auprès de Discord.
 *   (sans option)   sur le serveur de test : visible tout de suite
 *   --global        sur tous les serveurs : pour la production
 *   --clear-dev     retire les commandes du serveur de test
 */
const env = loadEnv();
const args = new Set(process.argv.slice(2));
const rest = new REST().setToken(env.DISCORD_TOKEN);

if (args.has('--global')) {
  const body = commands.map((command) => command.data.toJSON());
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
  console.log(`${body.length} commandes enregistrées sur tous les serveurs.`);
} else {
  if (!env.DISCORD_DEV_GUILD_ID) {
    console.error('DISCORD_DEV_GUILD_ID manque dans .env (ou utilise --global).');
    process.exit(1);
  }
  const body = args.has('--clear-dev') ? [] : commands.map((command) => command.data.toJSON());
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_DEV_GUILD_ID), {
    body,
  });
  console.log(
    body.length === 0
      ? 'Commandes du serveur de test retirées.'
      : `${body.length} commandes enregistrées sur le serveur de test.`,
  );
}
