import * as common from "../../common";
import { semanticColors } from "@vendetta/ui";
import { registerCommand } from "@vendetta/commands";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { 
    fetchUser, 
    fetchGuild, 
    fetchInvite, 
    formatTimestamp, 
    formatTimestampFromSnowflake,
    formatAvatarLinks, 
    maskUrl, 
    getGuildIconUrl,
    getBannerUrl,
    getGuildBannerUrl,
    getGuildSplashUrl,
    getGuildDiscoverySplashUrl,
    decodeBadges
} from "./utils/embeds.js";

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
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || false;
            
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
            
            const bannerUrl = user.banner ? getBannerUrl(user.id, user.banner) : null;
            const bannerLink = bannerUrl ? maskUrl("View Banner", bannerUrl) : "None";
            
            const accentColor = user.accent_color ? `#${user.accent_color.toString(16).padStart(6, '0')}` : "None";
            const badges = decodeBadges(user.public_flags || 0);
            
            const createdDate = user.created_at 
                ? formatTimestamp(Date.parse(user.created_at)) 
                : formatTimestampFromSnowflake(user.id);
            
            let decorationLinks = "None";
            let skuInfo = null;
            if (user.avatar_decoration) {
                const decoUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${user.avatar_decoration}.png?size=256`;
                decorationLinks = `${maskUrl("PNG", decoUrl)} | ${maskUrl("JPG", decoUrl)} | ${maskUrl("WebP", decoUrl)}`;
                skuInfo = user.avatar_decoration;
            }
            
            const fields = [
                { name: "Username", value: user.username, inline: true },
                { name: "Display Name", value: user.global_name || user.username, inline: true },
                { name: "Mention", value: `<@${user.id}>`, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Avatar", value: avatarLinks, inline: true },
                { name: "Banner", value: bannerLink, inline: true },
                { name: "Accent Color", value: accentColor, inline: true },
                { name: "Badges", value: badges, inline: false },
                { name: "Bot", value: user.bot ? "Yes" : "No", inline: true }
            ];
            
            if (user.avatar_decoration) {
                fields.push(
                    { name: "Avatar Decoration", value: decorationLinks, inline: true },
                    { name: "SKU", value: skuInfo, inline: false }
                );
            }
            
            fields.push({ name: "ID", value: `\`${user.id}\``, inline: false });
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                author: { name: user.username, icon_url: avatarUrl },
                image: bannerUrl ? { url: bannerUrl } : undefined,
                fields: fields
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

// Server Info Command
const serverInfoCommand = common.cmdDisplays({
    type: 1,
    inputType: 1,
    applicationId: "-1",
    name: "serverinfo",
    description: "Get information about a server by ID",
    options: [
        {
            required: true,
            type: 3,
            name: "server_id",
            description: "ID of the server",
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
            const guildId = args.find(a => a.name === "server_id")?.value;
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || false;
            
            if (!guildId) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a server ID.", flags: 64 } };
                }
                return;
            }
            
            const guild = await fetchGuild(guildId);
            
            if (!guild) {
                const errorMsg = `Server not found: ${guildId}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const featureMap = {
                "ANIMATED_ICON": "Animated Icon",
                "ANIMATED_BANNER": "Animated Banner",
                "BANNER": "Banner",
                "COMMUNITY": "Community",
                "DISCOVERABLE": "Discoverable",
                "INVITE_SPLASH": "Invite Splash",
                "MEMBER_VERIFICATION_GATE_ENABLED": "Member Verification",
                "NEWS": "News Channels",
                "SOUNDBOARD": "Soundboard",
                "VANITY_URL": "Vanity URL",
                "WIDGET_ENABLED": "Widget Enabled"
            };
            
            const verificationMap = { 0: "None", 1: "Low", 2: "Medium", 3: "High", 4: "Highest" };
            const nsfwLevelMap = { 0: "Default", 1: "Explicit", 2: "Safe", 3: "Age Restricted" };
            const mfaLevelMap = { 0: "None", 1: "Elevated" };
            const explicitContentFilterMap = { 0: "Disabled", 1: "Members Without Roles", 2: "All Members" };
            
            const features = (guild.features || [])
                .map(f => featureMap[f] || f)
                .sort()
                .slice(0, 15)
                .join(", ");
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            const bannerUrl = guild.banner ? getGuildBannerUrl(guild.id, guild.banner) : null;
            const splashUrl = guild.splash ? getGuildSplashUrl(guild.id, guild.splash) : null;
            const discoverySplashUrl = guild.discovery_splash ? getGuildDiscoverySplashUrl(guild.id, guild.discovery_splash) : null;
            
            const createdDate = guild.created_at 
                ? formatTimestamp(Date.parse(guild.created_at)) 
                : formatTimestampFromSnowflake(guild.id);
            
            const memberCount = guild.approximate_member_count || 0;
            const presenceCount = guild.approximate_presence_count || 0;
            const onlinePercentage = memberCount > 0 ? Math.round((presenceCount / memberCount) * 100) : 0;
            
            const afkTimeout = guild.afk_timeout ? `${guild.afk_timeout / 60} minutes` : "Not set";
            const preferredLocale = guild.preferred_locale || "en-US";
            
            const fields = [
                { name: "Owner ID", value: `\`${guild.owner_id}\``, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Members", value: `${memberCount.toLocaleString()} total\n${presenceCount.toLocaleString()} online (${onlinePercentage}%)`, inline: true },
                { name: "Boosts", value: `Level ${guild.premium_tier || 0}\n${guild.premium_subscription_count || 0} boosts`, inline: true },
                { name: "Verification", value: verificationMap[guild.verification_level || 0], inline: true },
                { name: "NSFW Level", value: nsfwLevelMap[guild.nsfw_level || 0], inline: true },
                { name: "MFA Level", value: mfaLevelMap[guild.mfa_level || 0], inline: true },
                { name: "Explicit Content", value: explicitContentFilterMap[guild.explicit_content_filter || 0], inline: true },
                { name: "AFK Timeout", value: afkTimeout, inline: true },
                { name: "Locale", value: preferredLocale, inline: true },
                { name: "Widget", value: guild.widget_enabled ? "Enabled" : "Disabled", inline: true },
                { name: "Features", value: features || "None", inline: false }
            ];
            
            if (guild.vanity_url_code) {
                fields.push({ name: "Vanity URL", value: `discord.gg/${guild.vanity_url_code}`, inline: true });
            }
            
            fields.push({ name: "ID", value: `\`${guild.id}\``, inline: false });
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: guild.description || "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                image: bannerUrl || splashUrl || discoverySplashUrl ? { url: bannerUrl || splashUrl || discoverySplashUrl } : undefined,
                fields: fields
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
    description: "Get server information from an invite code or URL",
    options: [
        {
            required: true,
            type: 3,
            name: "invite",
            description: "Invite code or URL (e.g., discord.gg/example)",
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
            const isEphemeral = args.find(a => a.name === "ephemeral")?.value || false;
            
            if (!inviteInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide an invite code or URL.", flags: 64 } };
                }
                return;
            }
            
            const extractInviteCode = (input) => {
                const urlMatch = input.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/);
                if (urlMatch) return urlMatch[1];
                const codeMatch = input.match(/^([a-zA-Z0-9_-]+)/);
                if (codeMatch) return codeMatch[1];
                return input;
            };
            
            const inviteCode = extractInviteCode(inviteInput);
            const invite = await fetchInvite(inviteCode);
            
            if (!invite || !invite.guild) {
                const errorMsg = `Invalid or expired invite: ${inviteCode}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                return;
            }
            
            const guild = invite.guild;
            const memberCount = invite.approximate_member_count || 0;
            const onlineCount = invite.approximate_presence_count || 0;
            const onlinePercentage = memberCount > 0 ? Math.round((onlineCount / memberCount) * 100) : 0;
            
            const createdDate = guild.created_at 
                ? formatTimestamp(Date.parse(guild.created_at)) 
                : formatTimestampFromSnowflake(guild.id);
            
            const expiresText = invite.expires_at ? formatDate(Date.parse(invite.expires_at)) : "Never";
            const inviteUrl = `https://discord.gg/${invite.code}`;
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            
            const fields = [
                { name: "Members", value: `${memberCount.toLocaleString()} total\n${onlineCount.toLocaleString()} online (${onlinePercentage}%)`, inline: true },
                { name: "Created", value: createdDate, inline: true },
                { name: "Boosts", value: `Level ${guild.premium_tier || 0}\n${guild.premium_subscription_count || 0} boosts`, inline: true },
                { name: "Invite URL", value: maskUrl(inviteUrl, inviteUrl), inline: true },
                { name: "Invite Code", value: `\`${invite.code}\``, inline: true },
                { name: "Channel", value: `#${invite.channel?.name || "Unknown"}`, inline: true },
                { name: "Channel ID", value: `\`${invite.channel?.id || "Unknown"}\``, inline: true },
                { name: "Inviter", value: invite.inviter?.username || "Vanity URL", inline: true },
                { name: "Inviter ID", value: invite.inviter ? `\`${invite.inviter.id}\`` : "N/A", inline: true },
                { name: "Expires", value: expiresText, inline: true },
                { name: "Max Uses", value: invite.max_uses?.toString() || "Unlimited", inline: true },
                { name: "Server ID", value: `\`${guild.id}\``, inline: false }
            ];
            
            const embed = {
                color: EMBED_COLOR(),
                type: "rich",
                title: guild.name,
                description: guild.description || "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                fields: fields
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