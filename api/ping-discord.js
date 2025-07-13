// api/ping-discord.js
// This file will be deployed as a serverless function on Vercel.

const { Client, GatewayIntentBits } = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Log in the Discord bot. This will only happen once when the serverless function "cold starts".
// Ensure this is awaited or handled to prevent race conditions in serverless.
console.log("Attempting Discord bot login...");
if (!client.isReady()) {
    client.login(DISCORD_BOT_TOKEN)
        .then(() => console.log(`Logged in as ${client.user.tag}!`))
        .catch(error => console.error("Failed to log in Discord bot:", error));
} else {
    console.log(`Bot already logged in as ${client.user.tag}.`);
}

// Vercel Serverless Function handler
module.exports = async (req, res) => {
    console.log("Received API request.");

    res.setHeader('Access-Control-Allow-Origin', 'https://ironwoodrpg.com');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        console.log("Handling OPTIONS preflight request.");
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        console.warn(`Method Not Allowed: ${req.method}`);
        return res.status(405).json({ error: 'Method Not Allowed. Only POST requests are accepted.' });
    }

    const { user_ids, channel_id, message_prefix } = req.body;
    console.log(`Request body: user_ids=${user_ids ? user_ids.length : 'none'}, channel_id=${channel_id}, message_prefix=${message_prefix}`);

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0 || !channel_id) {
        console.error("Validation Error: Missing or invalid user_ids or channel_id.");
        return res.status(400).json({ error: 'Missing user_ids (array), channel_id, or user_ids is empty.' });
    }

    // Ensure the bot is ready before attempting to send messages
    // This part is critical for serverless functions where the bot might not be instantly ready
    // after a cold start, even if client.login() was called.
    if (!client.isReady()) {
        console.warn("Discord client not ready yet inside handler. Waiting for 'ready' event or re-logging in...");
        try {
            // Wait for the client to be ready, or re-login if it failed previously
            await new Promise((resolve, reject) => {
                if (client.isReady()) {
                    console.log("Client became ready before promise.");
                    return resolve();
                }
                const timeout = setTimeout(() => {
                    client.off('ready', onReady);
                    reject(new Error("Discord client did not become ready in time."));
                }, 10000); // 10 second timeout for readiness

                const onReady = () => {
                    clearTimeout(timeout);
                    console.log("Client 'ready' event received.");
                    resolve();
                };
                client.once('ready', onReady);

                // Attempt login again if not already trying or failed
                if (!client.isReady() && !client.ws.shards.some(s => s.status === 0 || s.status === 1)) { // 0=READY, 1=CONNECTING
                     client.login(DISCORD_BOT_TOKEN)
                        .then(() => console.log("Re-login attempt successful."))
                        .catch(err => {
                            console.error("Re-login attempt failed:", err);
                            reject(err); // Propagate re-login error
                        });
                } else if (!client.isReady()) {
                    console.log("Client is already connecting, waiting for ready event.");
                }
            });
        } catch (loginOrReadyError) {
            console.error("Failed to ensure Discord client readiness:", loginOrReadyError);
            return res.status(500).json({ success: false, error: 'Discord bot not ready or failed to connect.', details: loginOrReadyError.message });
        }
    }

    try {
        console.log(`Attempting to fetch channel with ID: ${channel_id}`);
        const channel = await client.channels.fetch(channel_id);

        if (!channel) {
            console.error(`Channel with ID ${channel_id} not found.`);
            return res.status(404).json({ error: 'Discord channel not found.' });
        }
        console.log(`Found channel: ${channel.name} (${channel.id})`);

        // Construct the message with user mentions
        let messageContent = message_prefix || "Heads up! ";
        const mentions = user_ids.map(id => `<@${id}>`).join(' ');
        messageContent += `\n${mentions}\n`;
        messageContent += "Just a friendly reminder to check in!";

        console.log(`Attempting to send message to channel ${channel.id}: "${messageContent}"`);
        await channel.send(messageContent);
        console.log(`Successfully sent message to channel ${channel.name} (ID: ${channel.id}) mentioning ${user_ids.length} users.`);

        res.json({ success: true, message: `Message sent to channel ${channel.name} mentioning ${user_ids.length} users.` });
    } catch (error) {
        console.error('Error during Discord message sending process:', error);
        // Check for specific Discord API errors if possible
        if (error.code) { // Discord API errors often have a 'code' property
            console.error(`Discord API Error Code: ${error.code}`);
            if (error.code === 50001) { // Missing Access
                console.error("Bot likely does not have permissions to send messages in this channel or view it.");
                return res.status(403).json({ success: false, error: 'Bot lacks permissions to send messages in this channel.', details: error.message });
            } else if (error.code === 10003) { // Unknown Channel
                 console.error("Discord channel ID might be incorrect or the channel no longer exists.");
                 return res.status(404).json({ success: false, error: 'Discord channel not found or invalid ID.', details: error.message });
            }
        }
        res.status(500).json({ success: false, error: 'Failed to send Discord message.', details: error.message });
    }
};

