import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, formatAvatarLinks, getStatusText, sendEmbed, maskUrl } from "../utils/embeds";

const UserStore = findByStoreName("UserStore");
const GuildMemberStore = findByStoreName("GuildMemberStore");
const PresenceStore = findByStoreName("PresenceStore");

async function resolveUser(input: string): Promise<any | null> {
    if (/^\d+$/.test(input)) {
        let user = UserStore.getUser(input);
        if (user) return user;
        try {
            return await UserStore.fetchUser(input);
        } catch (e) {
            return null;
        }
    } else {
        const users = UserStore.getUsers();
        const foundUser = Object.values(users).find((u: any) => 
            u.username?.toLowerCase() === input.toLowerCase()
        );
        return foundUser || null;
    }
}

export const userInfoCommand = {
    name: "userinfo",
    displayName: "userinfo",
    description: "Get information about a user by username or ID",
    displayDescription: "Get information about a user by username or ID",
    options: [
        {
            name: "target",
            displayName: "target",
            description: "Username or ID of the user",
            displayDescription: "Username or ID of the user",
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
            const targetInput = args.find((a: any) => a.name === "target")?.value;
            const isEphemeral = args.find((a: any) => a.name === "ephemeral")?.value || false;
            
            if (!targetInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide a username or user ID.", flags: 64 } };
                }
                showToast("Please provide a username or user ID!", getAssetIDByName("Small"));
                return null;
            }
            
            const user = await resolveUser(targetInput);
            
            if (!user) {
                const errorMsg = `User not found: "${targetInput}"`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            let member = null;
            let joinedAt = null;
            let roles: any[] = [];
            let status = "offline";
            
            if (ctx.guild?.id) {
                member = GuildMemberStore.getMember(ctx.guild.id, user.id);
                if (member) {
                    joinedAt = member.joinedAt;
                    roles = member.roles || [];
                }
                const presence = PresenceStore.getState()?.[ctx.guild.id]?.[user.id];
                if (presence) {
                    status = presence.status || "offline";
                }
            }
            
            const avatarUrl = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
                : null;
            
            const avatarLinks = user.avatar ? formatAvatarLinks(user.avatar, user.id) : "None";
            
            let decorationLinks = "None";
            let skuInfo = null;
            if (user.avatarDecoration) {
                const decoUrl = `https://cdn.discordapp.com/avatar-decoration-presets/${user.avatarDecoration}.png?size=256`;
                decorationLinks = `${maskUrl("PNG", decoUrl)} | ${maskUrl("JPG", decoUrl)} | ${maskUrl("WebP", decoUrl)}`;
                skuInfo = user.avatarDecoration;
            }
            
            let rolesText = "None";
            if (roles.length > 0) {
                const roleNames = roles.map((r: any) => typeof r === 'object' ? `@${r.name}` : `@${r}`);
                rolesText = roleNames.join(', ');
                if (rolesText.length > 500) rolesText = rolesText.slice(0, 497) + '...';
            }
            
            const fields = [
                { name: "Display Name", value: user.globalName || user.username, inline: true },
                { name: "Mention", value: `<@${user.id}>`, inline: true },
                { name: "\u200b", value: "\u200b", inline: true },
                { name: "Created", value: formatTimestamp(user.createdAt), inline: true }
            ];
            
            if (joinedAt) {
                fields.push({ name: "Joined", value: formatTimestamp(joinedAt), inline: true });
            }
            
            fields.push({ name: "Avatar", value: avatarLinks, inline: true });
            
            if (user.avatarDecoration) {
                fields.push(
                    { name: "Avatar Decoration", value: decorationLinks, inline: true },
                    { name: "SKU", value: skuInfo, inline: false }
                );
            }
            
            fields.push(
                { name: "Roles", value: rolesText, inline: false },
                { name: "ID", value: user.id, inline: false }
            );
            
            const embed = {
                color: getEmbedColor(),
                type: "rich",
                author: { name: user.username, icon_url: avatarUrl },
                title: getStatusText(status),
                fields: fields
            };
            
            return sendEmbed(ctx.channel.id, embed, isEphemeral);
            
        } catch (error) {
            console.error("[UserInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            if (isEphemeral) {
                return { type: 4, data: { content: "Error fetching user information.", flags: 64 } };
            }
            showToast("Failed to fetch user information", getAssetIDByName("Small"));
            return null;
        }
    },
    applicationId: "-1",
    inputType: 1,
    type: 1,
};
