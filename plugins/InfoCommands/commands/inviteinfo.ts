import { findByProps, findByStoreName } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, formatDate, maskUrl, getGuildIconUrl, sendEmbed } from "../utils/embeds";

const InviteActions = findByProps("acceptInvite", "resolveInvite", "getInvite");

function extractInviteCode(input: string): string {
    const urlMatch = input.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    const codeMatch = input.match(/^([a-zA-Z0-9_-]+)/);
    if (codeMatch) return codeMatch[1];
    return input;
}

const featureMap: Record<string, string> = {
    "ANIMATED_ICON": "Animated Icon",
    "COMMUNITY": "Community",
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

export const inviteInfoCommand = {
    name: "inviteinfo",
    displayName: "inviteinfo",
    description: "Get server information from an invite code or vanity URL",
    displayDescription: "Get server information from an invite code or vanity URL",
    options: [
        {
            name: "invite",
            displayName: "invite",
            description: "Invite code or URL (e.g., discord.gg/example)",
            displayDescription: "Invite code or URL (e.g., discord.gg/example)",
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
            const inviteInput = args.find((a: any) => a.name === "invite")?.value;
            const isEphemeral = args.find((a: any) => a.name === "ephemeral")?.value || false;
            
            if (!inviteInput) {
                if (isEphemeral) {
                    return { type: 4, data: { content: "Please provide an invite code or URL.", flags: 64 } };
                }
                showToast("Please provide an invite code or URL!", getAssetIDByName("Small"));
                return null;
            }
            
            const inviteCode = extractInviteCode(inviteInput);
            
            let invite;
            try {
                invite = await InviteActions.resolveInvite(inviteCode);
            } catch (e) {
                const errorMsg = `Invalid or expired invite: ${inviteCode}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            if (!invite || !invite.guild) {
                const errorMsg = "Could not fetch invite information.";
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const guild = invite.guild;
            const isVanity = guild.vanityURLCode === inviteCode;
            const memberCount = invite.approximateMemberCount || 0;
            const onlineCount = invite.approximatePresenceCount || 0;
            
            const features = (guild.features || [])
                .map((f: string) => featureMap[f] || f)
                .sort()
                .slice(0, 11);
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            const expiresText = invite.expiresAt ? `${formatDate(invite.expiresAt)} at ${new Date(invite.expiresAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}` : "Never";
            
            const fields = [
                {
                    name: "Members",
                    value: `${memberCount} total\n${onlineCount} online\n${memberCount - onlineCount} offline`,
                    inline: true
                },
                {
                    name: "Details",
                    value: `Created: ${formatTimestamp(guild.createdAt)}\nBoost: Level ${guild.premiumTier || 0} (${guild.premiumSubscriptionCount || 0} boosts)\nVerification: ${verificationMap[guild.verificationLevel || 0]}\nNSFW: ${nsfwLevelMap[guild.nsfwLevel || 0]}`,
                    inline: false
                }
            ];
            
            if (features.length > 0) {
                fields.push({
                    name: `Features (${features.length})`,
                    value: features.join('\n'),
                    inline: false
                });
            }
            
            fields.push(
                {
                    name: "Invite Info",
                    value: `Code: \`${invite.code}\`\nChannel: #${invite.channel?.name || "unknown"}\nInviter: ${invite.inviter?.username || "Vanity URL"}\nExpires: ${expiresText}\nMax Uses: ${invite.maxUses || "Unlimited"}`,
                    inline: false
                },
                { name: "ID", value: guild.id, inline: true }
            );
            
            if (isVanity) {
                fields.push({
                    name: "Vanity URL",
                    value: maskUrl(`discord.gg/${inviteCode}`, `https://discord.gg/${inviteCode}`),
                    inline: true
                });
            }
            
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
            console.error("[InviteInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            if (isEphemeral) {
                return { type: 4, data: { content: "Error fetching invite information.", flags: 64 } };
            }
            showToast("Failed to fetch invite information", getAssetIDByName("Small"));
            return null;
        }
    },
    applicationId: "-1",
    inputType: 1,
    type: 1,
};
