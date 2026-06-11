import { findByStoreName, findByProps } from "@vendetta/metro";
import { semanticColors } from "@vendetta/ui";

const ThemeStore = findByStoreName("ThemeStore");
const { meta: { resolveSemanticColor } } = findByProps("colors", "meta");

export function getEmbedColor(): number {
    return parseInt(resolveSemanticColor(ThemeStore.theme, semanticColors.BACKGROUND_BASE_LOWER).slice(1), 16);
}

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

export function getStatusText(status: string): string {
    switch(status) {
        case "online": return "Online";
        case "idle": return "Idle";
        case "dnd": return "Do Not Disturb";
        default: return "Offline";
    }
}

export function sendEmbed(channelId: string, embed: any, isEphemeral: boolean = false) {
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
        sendBotMessage(channelId, { embeds: [embed] });
        return null;
    }
}
