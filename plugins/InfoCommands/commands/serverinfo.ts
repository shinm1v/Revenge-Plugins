import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, maskUrl, getGuildIconUrl, sendEmbed } from "../utils/embeds";

const GuildStore = findByStoreName("GuildStore");
const ChannelStore = findByStoreName("ChannelStore");
const RoleStore = findByStoreName("RoleStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const PresenceStore = findByStoreName("PresenceStore");

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
    description: "Get information about the current server",
    displayDescription: "Get information about the current server",
    options: [
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
            const isEphemeral = args.find((a: any) => a.name === "ephemeral")?.value || false;
            
            if (!ctx.guild?.id) {
                const errorMsg = "This command can only be used in a server.";
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const guild = GuildStore.getGuild(ctx.guild.id);
            if (!guild) {
                const errorMsg = "Failed to fetch server information.";
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const members = GuildMemberStore.getMembers(guild.id);
            const memberCount = Object.keys(members || {}).length;
            
            let botCount = 0;
            if (members) {
                Object.values(members).forEach((member: any) => {
                    if (member.user?.bot) botCount++;
                });
            }
            const humanCount = memberCount - botCount;
            
            const presences = PresenceStore.getState()?.[guild.id] || {};
            const onlineCount = Object.values(presences).filter((p: any) => p.status === "online").length;
            
            const channels = ChannelStore.getGuildChannels(guild.id);
            let text = 0, voice = 0, category = 0, news = 0, forum = 0;
            if (channels) {
                Object.values(channels).forEach((channel: any) => {
                    switch(channel.type) {
                        case 0: text++; break;
                        case 2: voice++; break;
                        case 4: category++; break;
                        case 5: news++; break;
                        case 15: forum++; break;
                    }
                });
            }
            
            const roleCount = Object.keys(RoleStore.getGuildRoles(guild.id) || {}).length;
            const boostCount = guild.premiumSubscriptionCount || 0;
            const boostLevel = guild.premiumTier || 0;
            
            const features = (guild.features || [])
                .map((f: string) => featureMap[f] || f)
                .sort()
                .slice(0, 10);
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            
            const fields = [
                {
                    name: "Members",
                    value: `${memberCount} total\n${humanCount} humans\n${botCount} bots\n${onlineCount} online`,
                    inline: true
                },
                {
                    name: "Channels",
                    value: `${text} text\n${voice} voice\n${category} categories\n${news} news\n${forum} forum`,
                    inline: true
                },
                {
                    name: "Details",
                    value: `Created: ${formatTimestamp(guild.createdAt)}\nBoost: Level ${boostLevel} (${boostCount})\nVerification: ${verificationMap[guild.verificationLevel || 0]}\nNSFW: ${nsfwLevelMap[guild.nsfwLevel || 0]}`,
                    inline: false
                },
                {
                    name: `Features (${features.length})`,
                    value: features.length > 0 ? features.join('\n') : "None",
                    inline: false
                },
                { name: "Roles", value: `${roleCount} total roles`, inline: true }
            ];
            
            if (guild.vanityURLCode) {
                fields.push({
                    name: "Vanity URL",
                    value: maskUrl(`discord.gg/${guild.vanityURLCode}`, `https://discord.gg/${guild.vanityURLCode}`),
                    inline: true
                });
            }
            
            fields.push({ name: "ID", value: guild.id, inline: false });
            
            const embed = {
                color: getEmbedColor(),
                type: "rich",
                title: guild.name,
                description: guild.description || "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                fields: fields
            };
            
            return sendEmbed(ctx.channel.id, embed, isEphemeral);
            
        } catch (error) {
            console.error("[ServerInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            if (isEphemeral) {
                return { type: 4, data: { content: "Error fetching server information.", flags: 64 } };
            }
            showToast("Failed to fetch server information", getAssetIDByName("Small"));
            return null;
        }
    },
    applicationId: "-1",
    inputType: 1,
    type: 1,
};
