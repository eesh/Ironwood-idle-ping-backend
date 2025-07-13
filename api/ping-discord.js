// api/ping-discord.js
// This file will be deployed as a serverless function on Vercel.

// Import necessary modules from discord.js
// Make sure to install discord.js in your project: npm install discord.js
const { Client, GatewayIntentBits } = require('discord.js');

// IMPORTANT: Your Discord Bot Token should be stored as an Environment Variable in Vercel.
// DO NOT hardcode it here. Vercel will inject it at runtime.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Initialize Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers // Required if your bot needs to fetch guild members
    ]
});

// Log in the Discord bot. This will only happen once when the serverless function "cold starts".
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// Only log in if the client is not already ready (important for serverless environments)
if (!client.isReady()) {
    console.log("Token length:", DISCORD_BOT_TOKEN.length);
    client.login(DISCORD_BOT_TOKEN)
        .catch(error => console.error("Failed to log in Discord bot:", error));
}


// Vercel Serverless Function handler
// This function will be called when your Vercel endpoint is accessed.
module.exports = async (req, res) => {
    // Set CORS headers to allow requests from your Tampermonkey script's domain
    res.setHeader('Access-Control-Allow-Origin', 'https://ironwoodrpg.com'); // Replace with your actual game's domain
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS requests (required for CORS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Ensure it's a POST request
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Only POST requests are accepted.' });
    }

    const { user_ids, channel_id, message_prefix } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0 || !channel_id) {
        return res.status(400).json({ error: 'Missing user_ids (array), channel_id, or user_ids is empty.' });
    }

    // Ensure the bot is ready before attempting to send messages
    if (!client.isReady()) {
        console.warn("Discord client not ready yet. Retrying login...");
        try {
            await client.login(DISCORD_BOT_TOKEN);
            console.log("Discord client successfully re-logged in.");
        } catch (loginError) {
            console.error("Failed to re-login Discord bot:", loginError);
            console.error("Token length:", DISCORD_BOT_TOKEN.length);
            return res.status(500).json({ success: false, error: 'Discord bot not ready and failed to re-login.' });
        }
    }

    try {
        // Fetch the channel
        const channel = await client.channels.fetch(channel_id);

        if (!channel) {
            return res.status(404).json({ error: 'Discord channel not found.' });
        }

        // Construct the message with user mentions
        let messageContent = message_prefix || "Heads up! "; // Use prefix or default
        const mentions = user_ids.map(id => `<@${id}>`).join(' ');
        messageContent += `\n${mentions}\n`;
        messageContent += "Just a friendly reminder to check in!"; // Customize your message suffix

        // Send the message to the specified channel
        await channel.send(messageContent);
        console.log(`Sent message to channel ${channel.name} (ID: ${channel_id}) mentioning: ${user_ids.join(', ')}`);

        res.json({ success: true, message: `Message sent to channel ${channel.name} mentioning ${user_ids.length} users.` });
    } catch (error) {
        console.error('Error sending Discord message:', error);
        res.status(500).json({ success: false, error: 'Failed to send Discord message.', details: error.message });
    }
};

