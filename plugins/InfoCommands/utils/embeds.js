import { findByProps } from "@vendetta/metro";

const API = findByProps("get", "post");
const DISCORD_EPOCH = 1420070400000;

// Convert Snowflake ID to timestamp
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
    if (!timestamp || isNaN(timestamp)) return "Unknown";
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

// Decode user badges
export function decodeBadges(flags) {
    const badges = {
        1 << 0: "Staff",
        1 << 1: "Partner",
        1 << 2: "Hypesquad",
        1 << 3: "Bug Hunter Level 1",
        1 << 6: "Hypesquad Bravery",
        1 << 7: "Hypesquad Brilliance",
        1 << 8: "Hypesquad Balance",
        1 << 9: "Early Supporter",
        1 << 10: "Team User",
        1 << 11: "Bug Hunter Level 2",
        1 << 12: "Verified Bot",
        1 << 13: "Early Verified Bot Developer",
        1 << 14: "Discord Certified Moderator",
        1 << 16: "Active Developer",
        1 << 18: "BOT_HTTP_INTERACTIONS"
    };
    
    const userBadges = [];
    for (const [bit, badge] of Object.entries(badges)) {
        if (flags & parseInt(bit)) {
            userBadges.push(badge);
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