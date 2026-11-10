import { KyroClient } from "../src/index.js";

const client = new KyroClient({
  token: process.env.KYRO_BOT_TOKEN,
  baseUrl: process.env.KYRO_API_URL,
});
client.on("ready", async () => {
  console.log("Bot is online!");
  await client.registerCommand({
    name: "ping",
    description: "Check this bot's connection",
    options: [
      {
        name: "private",
        description: "Only show the reply to you",
        type: "boolean",
      },
    ],
  });
});
client.on("messageCreate", async (message) => {
  if (!message.author.bot && message.content === "!ping")
    await message.reply("Pong!");
});
client.on("interactionCreate", async (interaction) => {
  if (interaction.name === "ping")
    await interaction.reply("Pong!", {
      ephemeral: interaction.options.private === true,
    });
});
client.on("error", (error) => console.error(error.message));
process.on("SIGINT", () => void client.destroy());
await client.login();
