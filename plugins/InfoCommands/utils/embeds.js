import { findByProps } from "@vendetta/metro";

const API = findByProps("get", "post");
const DISCORD_EPOCH = 1420070400000;

export function snowflakeToTimestamp(snowflake) {
    try {
        const id = BigInt(snowflake);
        const timestamp = Number((id >> 22n) + BigInt(DISCORD_EPOCH));
        return timestamp;
    } catch (e) {
        console.error("[Snowflake] Failed to convert:", e);
        return null;
    }
}

export function formatTimestamp(timestamp) {
    if (!timestamp) return "Unknown";
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

export function formatTimestampFromSnowflake(snowflake) {
    const timestamp = snowflakeToTimestamp(snowflake);
    if (!timestamp) return "Unknown";
    return formatTimestamp(timestamp);
}

export function formatDate(timestamp) {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function maskUrl(text, url) {
    return `[${text}](${url})`;
}

export function getAvatarUrls(userId, avatarHash) {
    const baseUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}`;
    const isGif = avatarHash?.startsWith("a_");

    return {
        png: `${baseUrl}.png?size=1024`,
        jpg: `${baseUrl}.jpg?size=1024`,
        webp: `${baseUrl}.webp?size=1024`,
        gif: isGif ? `${baseUrl}.gif?size=1024` : undefined
    };
}

export function formatAvatarLinks(avatarHash, userId) {
    if (!avatarHash) return "None";
    const urls = getAvatarUrls(userId, avatarHash);
    const links = [];
    links.push(maskUrl("PNG", urls.png));
    links.push(maskUrl("JPG", urls.jpg));
    links.push(maskUrl("WebP", urls.webp));
    if (urls.gif) links.push(maskUrl("GIF", urls.gif));
    return links.join(" | ");
}

export function getBannerUrl(userId, bannerHash) {
    if (!bannerHash) return null;
    const isGif = bannerHash.startsWith("a_");
    return `https://cdn.discordapp.com/banners/${userId}/${bannerHash}.${isGif ? "gif" : "png"}?size=1024`;
}

export function getGuildIconUrl(guildId, iconHash) {
    if (!iconHash) return null;
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=1024`;
}

export function getGuildBannerUrl(guildId, bannerHash) {
    if (!bannerHash) return null;
    return `https://cdn.discordapp.com/banners/${guildId}/${bannerHash}.png?size=1024`;
}

export function getGuildSplashUrl(guildId, splashHash) {
    if (!splashHash) return null;
    return `https://cdn.discordapp.com/splashes/${guildId}/${splashHash}.png?size=1024`;
}

export function getGuildDiscoverySplashUrl(guildId, discoverySplashHash) {
    if (!discoverySplashHash) return null;
    return `https://cdn.discordapp.com/discovery-splashes/${guildId}/${discoverySplashHash}.png?size=1024`;
}

export function decodeBadges(flags) {
    const badgeMap = [
        { bit: 1 << 0, name: "Staff" },
        { bit: 1 << 1, name: "Partner" },
        { bit: 1 << 2, name: "Hypesquad" },
        { bit: 1 << 3, name: "Bug Hunter Level 1" },
        { bit: 1 << 6, name: "Hypesquad Bravery" },
        { bit: 1 << 7, name: "Hypesquad Brilliance" },
        { bit: 1 << 8, name: "Hypesquad Balance" },
        { bit: 1 << 9, name: "Early Supporter" },
        { bit: 1 << 10, name: "Team User" },
        { bit: 1 << 11, name: "Bug Hunter Level 2" },
        { bit: 1 << 12, name: "Verified Bot" },
        { bit: 1 << 13, name: "Early Verified Bot Developer" },
        { bit: 1 << 14, name: "Discord Certified Moderator" },
        { bit: 1 << 16, name: "Active Developer" },
        { bit: 1 << 18, name: "BOT_HTTP_INTERACTIONS" }
    ];

    const userBadges = [];
    for (const badge of badgeMap) {
        if (flags & badge.bit) {
            userBadges.push(badge.name);
        }
    }
    return userBadges.length > 0 ? userBadges.join(", ") : "None";
}

export async function fetchUser(userId) {
    try {
        const response = await API.get({ url: `/users/${userId}` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch user:", e);
        return null;
    }
}

export async function fetchGuild(guildId) {
    try {
        const response = await API.get({ url: `/guilds/${guildId}?with_counts=true` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch guild:", e);
        return null;
    }
}

export async function fetchInvite(inviteCode) {
    try {
        const response = await API.get({ url: `/invites/${inviteCode}?with_counts=true&with_expiration=true` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch invite:", e);
        return null;
    }
}