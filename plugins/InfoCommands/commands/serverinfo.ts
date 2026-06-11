import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, maskUrl, getGuildIconUrl, fetchGuild, createSafeEmbed } from "../utils/embeds";

const featureMap: Record<string, string> = {
    "ANIMATED_ICON": "Animated Icon",
    "BANNER": "Banner",
    "COMMUNITY": "Community",
    "DISCOVERABLE": "Discoverable",
    "INVITE_SPLASH": "Invite Splash",
    "MEMBER_VERIFICATION_GATE_ENABLED": "Member Verification",
    "NEWS": "News Channels",
    "SOUNDBOARD": "Soundboard",
    "VANITY_URL": "Vanity URL",
};

const verificationMap: Record<number, string> = {
    0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Highest"
};

const nsfwLevelMap: Record<number, string> = {
    0: "Default", 1: "Explicit", 2: "Safe", 3: "Age Restricted"
};

export const serverInfoCommand = {
    name: "serverinfo",
    displayName: "serverinfo",
    description: "Get information about a server by ID",
    displayDescription: "Get information about a server by ID",
    options: [
        {
            name: "server_id",
            displayName: "server_id",
            description: "ID of the server",
            displayDescription: "ID of the server",
            type: 3,
            required: true,
        },
        {
            name: "ephemeral",
            displayName: "ephemeral",
            description: "Send as ephemeral message",
            displayDescription: "Send as ephemeral message",
            type: 5,
            required: false,
        }
    ],
    execute: async (args: any[], ctx: any) => {
        try {
            const guildId = args.find((a: any) => a.name === "server_id")?.value;
            const isEphemeral = args.find((a: any) => a.name === "ephemeral")?.value || false;
            
            if (!guildId) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a server ID.", flags: 64 } };
                }
                showToast("Please provide a server ID!", getAssetIDByName("Small"));
                return null;
            }
            
            if (!isEphemeral) {
                showToast(`Fetching server info...`, getAssetIDByName("DownloadIcon"));
            }
            
            const guild = await fetchGuild(guildId);
            
            if (!guild || !guild.id) {
                const errorMsg = `Server not found: ${guildId}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const features = (guild.features || [])
                .map((f: string) => featureMap[f] || f)
                .sort()
                .slice(0, 10);
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            
            const fields = [
                {
                    name: "Details",
                    value: `Created: ${guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : "Unknown"}\nBoost: Level ${guild.premium_tier ?? 0} (${guild.premium_subscription_count ?? 0} boosts)\nVerification: ${verificationMap[guild.verification_level ?? 0]}\nNSFW: ${nsfwLevelMap[guild.nsfw_level ?? 0]}`,
                    inline: false
                },
                {
                    name: `Features (${features.length})`,
                    value: features.length > 0 ? features.join('\n') : "None",
                    inline: false
                }
            ];
            
            if (guild.vanity_url_code) {
                fields.push({
                    name: "Vanity URL",
                    value: maskUrl(`discord.gg/${guild.vanity_url_code}`, `https://discord.gg/${guild.vanity_url_code}`),
                    inline: true
                });
            }
            
            fields.push({ name: "ID", value: guild.id, inline: false });
            
            const embed = createSafeEmbed({
                color: getEmbedColor(),
                title: guild.name ?? "Unknown Server",
                description: guild.description ?? "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                fields: fields
            });
            
            const { sendBotMessage } = findByProps("sendBotMessage", "sendMessage", "receiveMessage");
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                sendBotMessage(ctx.channel.id, { embeds: [embed] });
                return null;
            }
            
        } catch (error) {
            console.error("[ServerInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            const errorMsg = "Error fetching server information.";
            if (isEphemeral) {
                return { type: 4, data: { content: errorMsg, flags: 64 } };
            }
            showToast(errorMsg, getAssetIDByName("Small"));
            return null;
        }
    },
    applicationId: "-1",
    inputType: 1,
    type: 1,
};
