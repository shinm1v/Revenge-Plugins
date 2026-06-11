import { findByProps } from "@vendetta/metro";

const API = findByProps("get", "post");

export function formatTimestamp(timestamp: number): string {
    if (!timestamp) return "Unknown";
    return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

export function formatDate(timestamp: number): string {
    if (!timestamp) return "Unknown";
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function maskUrl(text: string, url: string): string {
    return `[${text}](${url})`;
}

export function getAvatarUrls(userId: string, avatarHash: string): { png: string; jpg: string; webp: string; gif?: string } {
    const baseUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}`;
    const isGif = avatarHash?.startsWith("a_");
    
    return {
        png: `${baseUrl}.png?size=256`,
        jpg: `${baseUrl}.jpg?size=256`,
        webp: `${baseUrl}.webp?size=256`,
        gif: isGif ? `${baseUrl}.gif?size=256` : undefined
    };
}

export function formatAvatarLinks(avatarHash: string, userId: string): string {
    if (!avatarHash) return "None";
    const urls = getAvatarUrls(userId, avatarHash);
    const links = [];
    links.push(maskUrl("PNG", urls.png));
    links.push(maskUrl("JPG", urls.jpg));
    links.push(maskUrl("WebP", urls.webp));
    if (urls.gif) links.push(maskUrl("GIF", urls.gif));
    return links.join(" | ");
}

export function getGuildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=256`;
}

export async function fetchUser(userId: string) {
    try {
        const response = await API.get({ url: `/users/${userId}` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch user:", e);
        return null;
    }
}

export async function fetchGuild(guildId: string) {
    try {
        const response = await API.get({ url: `/guilds/${guildId}` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch guild:", e);
        return null;
    }
}

export async function fetchInvite(inviteCode: string) {
    try {
        const response = await API.get({ url: `/invites/${inviteCode}` });
        return response.body;
    } catch (e) {
        console.error("[API] Failed to fetch invite:", e);
        return null;
    }
}
