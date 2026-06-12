import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
const { sendMessage } = findByProps("sendMessage", "receiveMessage");
const { createBotMessage } = findByProps("createBotMessage");

const MentionIcon = getAssetIDByName("ic_mention_24px") ??
    getAssetIDByName("MentionIcon") ??
    getAssetIDByName("mention");

// Import the extract function from InfoCommands
// Since it's a separate folder, you need to use relative path
let extractMentionsFromEmbed;
try {
    const { extractMentionsFromEmbed: extractFn } = require("../InfoCommands/utils/embeds.js");
    extractMentionsFromEmbed = extractFn;
} catch (e) {
    // Fallback if can't import
    extractMentionsFromEmbed = (embed) => {
        const mentions = { users: [], channels: [], roles: [] };
        if (!embed) return mentions;
        
        const textToCheck = [];
        if (embed.author?.name) textToCheck.push(embed.author.name);
        if (embed.title) textToCheck.push(embed.title);
        if (embed.description) textToCheck.push(embed.description);
        if (embed.footer?.text) textToCheck.push(embed.footer.text);
        if (embed.fields) {
            for (const field of embed.fields) {
                if (field.name) textToCheck.push(field.name);
                if (field.value) textToCheck.push(field.value);
            }
        }
        
        for (const text of textToCheck) {
            if (typeof text === "string") {
                const userMatches = text.match(/<@!?(\d+)>/g);
                const channelMatches = text.match(/<#(\d+)>/g);
                const roleMatches = text.match(/<@&(\d+)>/g);
                if (userMatches) mentions.users.push(...userMatches);
                if (channelMatches) mentions.channels.push(...channelMatches);
                if (roleMatches) mentions.roles.push(...roleMatches);
            }
        }
        
        mentions.users = [...new Set(mentions.users)];
        mentions.channels = [...new Set(mentions.channels)];
        mentions.roles = [...new Set(mentions.roles)];
        return mentions;
    };
}

function extractMentionsFromMessage(message) {
    const mentions = { users: [], channels: [], roles: [] };
    
    if (message.content) {
        const userMatches = message.content.match(/<@!?(\d+)>/g);
        const channelMatches = message.content.match(/<#(\d+)>/g);
        const roleMatches = message.content.match(/<@&(\d+)>/g);
        if (userMatches) mentions.users.push(...userMatches);
        if (channelMatches) mentions.channels.push(...channelMatches);
        if (roleMatches) mentions.roles.push(...roleMatches);
    }
    
    if (message.embeds) {
        for (const embed of message.embeds) {
            const embedMentions = extractMentionsFromEmbed(embed);
            mentions.users.push(...embedMentions.users);
            mentions.channels.push(...embedMentions.channels);
            mentions.roles.push(...embedMentions.roles);
        }
    }
    
    mentions.users = [...new Set(mentions.users)];
    mentions.channels = [...new Set(mentions.channels)];
    mentions.roles = [...new Set(mentions.roles)];
    
    return mentions;
}

function sendMentionMessage(channelId, mentions) {
    const messageParts = [];
    
    if (mentions.users.length > 0) {
        messageParts.push("**Users:** " + mentions.users.join(" "));
    }
    if (mentions.channels.length > 0) {
        messageParts.push("**Channels:** " + mentions.channels.join(" "));
    }
    if (mentions.roles.length > 0) {
        messageParts.push("**Roles:** " + mentions.roles.join(" "));
    }
    
    if (messageParts.length === 0) return;
    
    const content = messageParts.join("\n");
    const msg = createBotMessage(channelId, { content: content });
    sendMessage(channelId, msg);
}

let unpatchOpenLazy = null;

export default {
    onLoad() {
        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;
            
            const message = msg.message;
            const mentions = extractMentionsFromMessage(message);
            const totalMentions = mentions.users.length + mentions.channels.length + mentions.roles.length;
            
            if (totalMentions === 0) return;
            
            comp.then((instance) => {
                const unpatch = after("default", instance, (_, component) => {
                    React.useEffect(() => () => { unpatch(); }, []);
                    
                    const groups = findInReactTree(
                        component,
                        (c) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );
                    
                    if (!groups?.length) return;
                    
                    const showButton = React.createElement(ActionSheetRow, {
                        label: totalMentions === 1 ? "Show Mention" : `Show ${totalMentions} Mentions`,
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: MentionIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            sendMentionMessage(message.channel_id, mentions);
                        },
                    });
                    
                    let inserted = false;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren = findInReactTree(
                            groups[gi],
                            (c) => Array.isArray(c) && c.some((child) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        if (!groupChildren) continue;
                        
                        groupChildren.unshift(showButton);
                        inserted = true;
                        break;
                    }
                    
                    if (!inserted) {
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, showButton)
                        );
                    }
                });
            });
        });
    },
    
    onUnload() {
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
    },
};