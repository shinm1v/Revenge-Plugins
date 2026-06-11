import * as common from "../../common";
import { semanticColors } from "@vendetta/ui";
import { registerCommand } from "@vendetta/commands";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { fetchUser, fetchGuild, fetchInvite, formatTimestamp, formatAvatarLinks, maskUrl, getGuildIconUrl } from "./utils/embeds.js";

const ThemeStore = findByStoreName("ThemeStore");
const { meta: { resolveSemanticColor } } = findByProps("colors", "meta");

export const EMBED_COLOR = () =>
    parseInt(resolveSemanticColor(ThemeStore.theme, semanticColors.BACKGROUND_BASE_LOWER).slice(1), 16);

const authorMods = {
    author: {
        username: "InfoCommands",
        avatar: "command",
        avatarURL: common.AVATARS.command,
    },
};

let madeSendMessage;
function sendMessage() {
    if (window.sendMessage) return window.sendMessage(...arguments);
    if (!madeSendMessage) madeSendMessage = common.mSendMessage(vendetta);
    return madeSendMessage(...arguments);
}

// User Info Command
const userInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "userinfo",
    description: "Get information about a user by ID",
    options: [
        {
            required: true,
            type: 3,
            name: "user_id",
            description: "ID of the user",
        },
        {
            required: false,
            type: 5,
            name: "ephemeral",
            description: "Send as ephemeral message",
        }
    ],
    execute: async (args, ctx) => {
        try {
            const userId = args.find(a => a.name === "user_id")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || true;
            
            if (!userId) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a user ID.", flags: 64 } };
                }
                return;
            }
            
            const user = await fetchUser(userId);
            
            if (!user) {
                const errorMsg = `User not found: ${userId}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const avatarUrl = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
                : null;
            
            const avatarLinks = user.avatar ? formatAvatarLinks(user.avatar, user.id) : "None";
            
            // Cleaner embed - fewer fields, better layout
            const description = [
                `**Display Name:** ${user.global_name || user.username}`,
                `**Mention:** <@${user.id}>`,
                `**Created:** ${formatTimestamp(Date.parse(user.created_at)) || "Unknown"}`,
                `**Bot:** ${user.bot ? "Yes" : "No"}`,
                `**Avatar:** ${avatarLinks}`,
                user.avatar_decoration ? `**Avatar Decoration:** ${user.avatar_decoration}` : null,
                `\n**ID:** \`${user.id}\``
            ].filter(Boolean).join("\n");
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                author: { name: user.username, icon_url: avatarUrl },
                description: description
            };
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                const messageMods = {
                    ...authorMods,
                    interaction: {
                        name: "/userinfo",
                        user: findByStoreName("UserStore").getCurrentUser(),
                    },
                };
                sendMessage({
                    loggingName: "UserInfo output",
                    channelId: ctx.channel.id,
                    embeds: [embed],
                }, messageMods);
                return null;
            }
        } catch (error) {
            console.error("[UserInfo] Error:", error);
            return null;
        }
    }
});

// Server Info Command (using invite endpoint which has counts)
const serverInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "serverinfo",
    description: "Get information about a server by invite code",
    options: [
        {
            required: true,
            type: 3,
            name: "invite",
            description: "Invite code or vanity URL (e.g., bloxfruit)",
        },
        {
            required: false,
            type: 5,
            name: "ephemeral",
            description: "Send as ephemeral message",
        }
    ],
    execute: async (args, ctx) => {
        try {
            let inviteInput = args.find(a => a.name === "invite")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || true;
            
            if (!inviteInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide an invite code.", flags: 64 } };
                }
                return;
            }
            
            // Extract code from URL if needed
            const urlMatch = inviteInput.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/);
            if (urlMatch) inviteInput = urlMatch[1];
            
            const invite = await fetchInvite(inviteInput);
            
            if (!invite || !invite.guild) {
                const errorMsg = `Invalid invite: ${inviteInput}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const guild = invite.guild;
            const memberCount = invite.approximate_member_count || 0;
            const onlineCount = invite.approximate_presence_count || 0;
            
            // Clean feature names
            const featureMap = {
                "ANIMATED_ICON": "Animated Icon",
                "ANIMATED_BANNER": "Animated Banner",
                "BANNER": "Banner",
                "COMMUNITY": "Community",
                "INVITE_SPLASH": "Invite Splash",
                "MEMBER_VERIFICATION_GATE_ENABLED": "Member Verification",
                "NEWS": "News Channels",
                "SOUNDBOARD": "Soundboard",
                "VANITY_URL": "Vanity URL",
                "AUTO_MODERATION": "Auto Moderation",
                "AGE_VERIFICATION_LARGE_GUILD": "Age Verification"
            };
            
            const verificationMap = { 0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Highest" };
            const nsfwLevelMap = { 0: "Default", 1: "Explicit", 2: "Safe", 3: "Age Restricted" };
            
            const features = (guild.features || [])
                .map(f => featureMap[f] || f.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase()))
                .sort()
                .slice(0, 15)
                .join("\n");
            
            const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null;
            const createdAt = guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : "Unknown";
            
            const description = [
                guild.description || "",
                "",
                "**Members**",
                `${memberCount.toLocaleString()} total • ${onlineCount.toLocaleString()} online`,
                "",
                "**Details**",
                `Created: ${createdAt}`,
                `Boost: Level ${guild.premium_tier || 0} (${guild.premium_subscription_count || 0} boosts)`,
                `Verification: ${verificationMap[guild.verification_level || 0]}`,
                `NSFW Level: ${nsfwLevelMap[guild.nsfw_level || 0]}`,
                "",
                `**Features (${guild.features?.length || 0})**`,
                features || "None",
                "",
                guild.vanity_url_code ? `**Vanity URL**\ndiscord.gg/${guild.vanity_url_code}` : null,
                "",
                `**ID**\n${guild.id}`
            ].filter(Boolean).join("\n");
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: description,
                thumbnail: iconUrl ? { url: iconUrl } : undefined
            };
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                const messageMods = {
                    ...authorMods,
                    interaction: {
                        name: "/serverinfo",
                        user: findByStoreName("UserStore").getCurrentUser(),
                    },
                };
                sendMessage({
                    loggingName: "ServerInfo output",
                    channelId: ctx.channel.id,
                    embeds: [embed],
                }, messageMods);
                return null;
            }
        } catch (error) {
            console.error("[ServerInfo] Error:", error);
            return null;
        }
    }
});

// Invite Info Command
const inviteInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "inviteinfo",
    description: "Get detailed invite information",
    options: [
        {
            required: true,
            type: 3,
            name: "invite",
            description: "Invite code or URL",
        },
        {
            required: false,
            type: 5,
            name: "ephemeral",
            description: "Send as ephemeral message",
        }
    ],
    execute: async (args, ctx) => {
        try {
            let inviteInput = args.find(a => a.name === "invite")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || true;
            
            if (!inviteInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide an invite code.", flags: 64 } };
                }
                return;
            }
            
            const urlMatch = inviteInput.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/);
            if (urlMatch) inviteInput = urlMatch[1];
            
            const invite = await fetchInvite(inviteInput);
            
            if (!invite || !invite.guild) {
                const errorMsg = `Invalid invite: ${inviteInput}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const guild = invite.guild;
            const memberCount = invite.approximate_member_count || 0;
            const onlineCount = invite.approximate_presence_count || 0;
            const createdAt = guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : "Unknown";
            const expiresText = invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "Never";
            
            const description = [
                guild.description || "",
                "",
                "**Members**",
                `${memberCount.toLocaleString()} total • ${onlineCount.toLocaleString()} online • ${(memberCount - onlineCount).toLocaleString()} offline`,
                "",
                "**Server Details**",
                `Created: ${createdAt}`,
                `Boost: Level ${guild.premium_tier || 0} (${guild.premium_subscription_count || 0} boosts)`,
                "",
                "**Invite Details**",
                `Code: \`${invite.code}\``,
                `Channel: ${invite.channel?.name || "Unknown"}`,
                `Inviter: ${invite.inviter?.username || "Vanity URL"}`,
                `Expires: ${expiresText}`,
                `Max Uses: ${invite.max_uses || "Unlimited"}`,
                "",
                `**Server ID**\n${guild.id}`
            ].filter(Boolean).join("\n");
            
            const iconUrl = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : null;
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: description,
                thumbnail: iconUrl ? { url: iconUrl } : undefined
            };
            
            if (isEphemeral) {
                return {
                    type: 4,
                    data: {
                        embeds: [embed],
                        flags: 64
                    }
                };
            } else {
                const messageMods = {
                    ...authorMods,
                    interaction: {
                        name: "/inviteinfo",
                        user: findByStoreName("UserStore").getCurrentUser(),
                    },
                };
                sendMessage({
                    loggingName: "InviteInfo output",
                    channelId: ctx.channel.id,
                    embeds: [embed],
                }, messageMods);
                return null;
            }
        } catch (error) {
            console.error("[InviteInfo] Error:", error);
            return null;
        }
    }
});

const commands = [userInfoCommand, serverInfoCommand, inviteInfoCommand];
const patches = [];

export default {
    meta: vendetta.plugin,
    patches: [],
    onLoad() {
        for (const command of commands) {
            try {
                patches.push(registerCommand(command));
                console.log(`[InfoCommands] Registered: ${command.name}`);
            } catch (e) {
                console.error(`[InfoCommands] Failed:`, e);
            }
        }
    },
    onUnload() {
        for (const unpatch of patches) {
            try {
                unpatch();
            } catch (e) {}
        }
        patches.length = 0;
    },
};