import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, formatAvatarLinks, sendEmbed, maskUrl, fetchUser } from "../utils/embeds";

export const userInfoCommand = {
    name: "userinfo",
    displayName: "userinfo",
    description: "Get information about a user by ID",
    displayDescription: "Get information about a user by ID",
    options: [
        {
            name: "user_id",
            displayName: "user_id",
            description: "ID of the user",
            displayDescription: "ID of the user",
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
            const userId = args.find((a: any) => a.name === "user_id")?.value;
            const isEphemeral = args.find((a: any) => a.name === "ephemeral")?.value || false;
            
            if (!userId) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a user ID.", flags: 64 } };
                }
                showToast("Please provide a user ID!", getAssetIDByName("Small"));
                return null;
            }
            
            if (!isEphemeral) {
                showToast(`Fetching user info...`, getAssetIDByName("DownloadIcon"));
            }
            
            const user = await fetchUser(userId);
            
            if (!user) {
                const errorMsg = `User not found: ${userId}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const avatarUrl = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
                : null;
            
            const avatarLinks = user.avatar ? formatAvatarLinks(user.avatar, user.id) : "None";
            
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
                { name: "Created", value: formatTimestamp(Date.parse(user.created_at)), inline: true },
                { name: "Avatar", value: avatarLinks, inline: true }
            ];
            
            if (user.avatar_decoration) {
                fields.push(
                    { name: "Avatar Decoration", value: decorationLinks, inline: true },
                    { name: "SKU", value: skuInfo, inline: false }
                );
            }
            
            fields.push(
                { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
                { name: "ID", value: user.id, inline: false }
            );
            
            const embed = {
                color: getEmbedColor(),
                type: "rich",
                author: { name: user.username, icon_url: avatarUrl },
                fields: fields
            };
            
            return sendEmbed(ctx.channel.id, embed, isEphemeral);
            
        } catch (error) {
            console.error("[UserInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            const errorMsg = "Error fetching user information.";
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