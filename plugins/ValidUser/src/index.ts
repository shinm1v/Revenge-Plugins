import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { logger } from "@vendetta";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const MentionIcon = getAssetIDByName("ic_mention_24px") ??
    getAssetIDByName("MentionIcon") ??
    getAssetIDByName("mention");

function extractIdsFromText(text: string): string[] {
    if (!text) return [];
    return [...text.matchAll(/<@!?(\d+)>/g)].map(x => x[1]);
}

function extractAllMentionIds(message: any): string[] {
    const ids: string[] = [];
    
    if (message.content) {
        ids.push(...extractIdsFromText(message.content));
    }
    
    if (message.embeds && Array.isArray(message.embeds)) {
        for (const embed of message.embeds) {
            if (embed.rawTitle) {
                ids.push(...extractIdsFromText(embed.rawTitle));
            }
            if (embed.rawDescription) {
                ids.push(...extractIdsFromText(embed.rawDescription));
            }
            if (embed.fields && Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    if (field.name) ids.push(...extractIdsFromText(field.name));
                    if (field.value) ids.push(...extractIdsFromText(field.value));
                }
            }
        }
    }
    
    return [...new Set(ids)];
}

async function fixUnknownMentions(message: any) {
    const ids = extractAllMentionIds(message);
    
    if (ids.length === 0) {
        logger.log("[ValidUser] No mention IDs found in message or embeds");
        return;
    }
    
    logger.log(`[ValidUser] Fixing ${ids.length} unknown mention(s): ${ids.join(", ")}`);
    
    const API = findByProps("get", "post");
    const Dispatcher = findByProps("dispatch", "subscribe");
    
    try {
        for (const userId of ids) {
            const res = await API.get({ url: `/users/${userId}` });
            Dispatcher.dispatch({
                type: "USER_UPDATE",
                user: res.body
            });
            logger.log(`[ValidUser] Cached user: ${res.body.username} (${userId})`);
        }
        
        Dispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: { ...message }
        });
        
        logger.log(`[ValidUser] Dispatched MESSAGE_UPDATE to re-render`);
    } catch (err) {
        logger.error("[ValidUser] Failed to fix mentions:", err);
    }
}

let unpatchOpenLazy: (() => void) | null = null;

export default {
    onLoad() {
        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const message = msg.message;
            const ids = extractAllMentionIds(message);
            
            if (ids.length === 0) return;

            comp.then((instance: any) => {
                const unpatch = after("default", instance, (_: any, component: any) => {
                    React.useEffect(() => () => { unpatch(); }, []);

                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
                        logger.warn("[ValidUser] Could not find ActionSheetRowGroups");
                        return;
                    }

                    const fixButton = React.createElement(ActionSheetRow, {
                        label: ids.length === 1 ? "Fix Unknown Mention" : `Fix ${ids.length} Unknown Mentions`,
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: MentionIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            fixUnknownMentions(message);
                        },
                    });

                    let inserted = false;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren: any[] = findInReactTree(
                            groups[gi],
                            (c: any) => Array.isArray(c) && c.some((child: any) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        if (!groupChildren) continue;

                        groupChildren.unshift(fixButton);
                        inserted = true;
                        break;
                    }

                    if (!inserted) {
                        logger.warn("[ValidUser] Could not insert button, adding as new group");
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, fixButton)
                        );
                    }
                });
            });
        });

        logger.log("[ValidUser] Loaded.");
    },

    onUnload() {
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
        logger.log("[ValidUser] Unloaded.");
    },
};