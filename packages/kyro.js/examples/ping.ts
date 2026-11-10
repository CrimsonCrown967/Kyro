import { KyroClient } from "../src/index.js";

const client = new KyroClient({ token: process.env.KYRO_BOT_TOKEN });

client.on("ready", (bot) => {
  console.log(`${bot.username} is online`);
});
client.on("error", (error) => {
  console.error(error.message);
});

client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping") {
    await message.reply({ content: "Pong!", clientId: `ping:${message.id}` });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.commandName === "ping") {
    await interaction.reply({ content: "Pong!", ephemeral: true });
  }
  if (interaction.commandName === "greet") {
    await interaction.reply(`Hello, ${String(interaction.options.name)}!`);
  }
});

await client.registerCommands([
  { name: "ping", description: "Check whether the bot is online" },
  {
    name: "greet",
    description: "Say hello",
    options: [
      {
        name: "name",
        type: "string",
        description: "Who to greet",
        required: true,
      },
    ],
  },
]);

await client.login();
process.once("SIGINT", () => {
  void client.destroy();
});
process.once("SIGTERM", () => {
  void client.destroy();
});
