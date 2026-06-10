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

async function openMentionProfile(content: string) {
    const ids = [...content.matchAll(/<@!?(\d+)>/g)].map(x => x[1]);
    
    if (ids.length === 0) {
        logger.log("[ValidUser] No mention IDs found in content");
        return;
    }
    
    const userId = ids[0];
    logger.log(`[ValidUser] Opening profile for user: ${userId}`);
    
    try {
        const UserAPI = findByProps("fetchProfile", "insertStaticUser");
        const Profile = findByProps("showUserProfile", "navigateToStage");
        
        await UserAPI.fetchProfile(userId);
        
        Profile.showUserProfile({ userId });
        logger.log(`[ValidUser] Successfully opened profile for ${userId}`);
    } catch (err) {
        logger.error("[ValidUser] Failed to open profile:", err);
    }
}

let unpatchOpenLazy: (() => void) | null = null;

export default {
    onLoad() {
        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const content: string = msg.message.content ?? "";
            
            const hasMentions = content.match(/<@!?(\d+)/);
            if (!hasMentions) return;

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

                    const mentionButton = React.createElement(ActionSheetRow, {
                        label: "Open Mention Profile",
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: MentionIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            openMentionProfile(content);
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

                        groupChildren.unshift(mentionButton);
                        inserted = true;
                        break;
                    }

                    if (!inserted) {
                        logger.warn("[ValidUser] Could not insert button, adding as new group");
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, mentionButton)
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