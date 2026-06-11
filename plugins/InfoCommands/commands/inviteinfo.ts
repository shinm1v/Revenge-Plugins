import { showToast } from "@vendetta/ui/toasts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { getEmbedColor, formatTimestamp, formatDate, maskUrl, getGuildIconUrl, fetchInvite, createSafeEmbed } from "../utils/embeds";

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
            
            if (!isEphemeral) {
                showToast(`Fetching invite info...`, getAssetIDByName("DownloadIcon"));
            }
            
            const inviteCode = extractInviteCode(inviteInput);
            const invite = await fetchInvite(inviteCode);
            
            if (!invite || !invite.guild || !invite.guild.id) {
                const errorMsg = `Invalid or expired invite: ${inviteCode}`;
                if (isEphemeral) {
                    return { type: 4, data: { content: errorMsg, flags: 64 } };
                }
                showToast(errorMsg, getAssetIDByName("Small"));
                return null;
            }
            
            const guild = invite.guild;
            const memberCount = invite.approximate_member_count ?? 0;
            const onlineCount = invite.approximate_presence_count ?? 0;
            
            const features = (guild.features || [])
                .map((f: string) => featureMap[f] || f)
                .sort()
                .slice(0, 11);
            
            const iconUrl = guild.icon ? getGuildIconUrl(guild.id, guild.icon) : null;
            
            // SAFE date parsing - handles both timestamps and ISO strings
            let expiresText = "Never";
            if (invite.expires_at) {
                try {
                    const expiresDate = typeof invite.expires_at === 'string' ? Date.parse(invite.expires_at) : invite.expires_at;
                    if (!isNaN(expiresDate)) {
                        expiresText = formatDate(expiresDate);
                    }
                } catch (e) {
                    expiresText = "Unknown";
                }
            }
            
            const fields = [
                {
                    name: "Members",
                    value: `${memberCount} total\n${onlineCount} online\n${memberCount - onlineCount} offline`,
                    inline: true
                },
                {
                    name: "Details",
                    value: `Created: ${guild.created_at ? formatTimestamp(Date.parse(guild.created_at)) : "Unknown"}\nBoost: Level ${guild.premium_tier ?? 0} (${guild.premium_subscription_count ?? 0} boosts)\nVerification: ${verificationMap[guild.verification_level ?? 0]}\nNSFW: ${nsfwLevelMap[guild.nsfw_level ?? 0]}`,
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
                    value: `Code: \`${invite.code ?? "Unknown"}\`\nChannel: #${invite.channel?.name ?? "unknown"}\nInviter: ${invite.inviter?.username ?? "Vanity URL"}\nExpires: ${expiresText}\nMax Uses: ${invite.max_uses ?? "Unlimited"}`,
                    inline: false
                },
                { name: "ID", value: guild.id, inline: true }
            );
            
            const embed = createSafeEmbed({
                color: getEmbedColor(),
                title: guild.name ?? "Unknown Server",
                description: guild.description ?? "No description.",
                thumbnail: iconUrl ? { url: iconUrl } : undefined,
                fields: fields
            });
            
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
                sendBotMessage(ctx.channel.id, { embeds: [embed] });
                return null;
            }
            
        } catch (error) {
            console.error("[InviteInfo] Error:", error);
            const isEphemeral = args?.find?.((a: any) => a.name === "ephemeral")?.value || false;
            const errorMsg = "Error fetching invite information.";
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