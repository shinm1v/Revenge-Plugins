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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

function isUserCached(userId: string): boolean {
    const UserStore = findByProps("getUser", "getCurrentUser");
    const user = UserStore?.getUser?.(userId);
    return !!user;
}

async function fetchUsersViaGateway(userIds: string[]): Promise<boolean> {
    const GatewayConnection = findByProps("getGateway", "send");
    const SelectedGuildStore = findByProps("getGuildId", "getChannelId");
    
    const currentGuildId = SelectedGuildStore?.getGuildId?.();
    if (!currentGuildId) {
        logger.warn("[ValidUser] No guild context for gateway request");
        return false;
    }

    const ws = GatewayConnection?.getGateway?.();
    if (!ws) {
        logger.warn("[ValidUser] Gateway connection not available");
        return false;
    }

    logger.log(`[ValidUser] Sending bulk gateway request for ${userIds.length} users.`);

    ws.send(8, {
        guild_id: currentGuildId,
        user_ids: userIds,
        presences: false
    });

    await sleep(500);
    return true;
}

async function fetchUsersViaAPI(userId: string, token: string, API: any, Dispatcher: any) {
    const res = await API.get({
        url: `/users/${userId}`,
        headers: {
            Authorization: token
        }
    });
    Dispatcher.dispatch({
        type: "USER_UPDATE",
        user: res.body
    });
    return res.body.username;
}

async function fixUnknownMentions(message: any) {
    const ids = extractAllMentionIds(message);

    if (ids.length === 0) {
        logger.log("[ValidUser] No mention IDs found in message or embeds");
        return;
    }

    const Dispatcher = findByProps("dispatch", "subscribe");

    const uncachedIds: string[] = [];
    for (const userId of ids) {
        if (!isUserCached(userId)) {
            uncachedIds.push(userId);
        }
    }

    if (uncachedIds.length === 0) {
        logger.log("[ValidUser] All users already cached, refreshing UI only");
        Dispatcher.dispatch({ type: "JUMP_TO_FIRST_MESSAGE" });
        await sleep(50);
        Dispatcher.dispatch({ type: "JUMP_TO_LAST_MESSAGE" });
        return;
    }

    logger.log(`[ValidUser] ${uncachedIds.length} uncached user(s) out of ${ids.length} total`);

    const BULK_THRESHOLD = 5;
    let success = false;

    if (uncachedIds.length > BULK_THRESHOLD) {
        logger.log(`[ValidUser] Using gateway bulk fetch for ${uncachedIds.length} users`);
        success = await fetchUsersViaGateway(uncachedIds);
    }

    if (!success) {
        logger.log(`[ValidUser] Falling back to individual API requests for ${uncachedIds.length} users`);
        
        const API = findByProps("get", "post");
        const TokenStore = findByProps("getToken");
        const token = TokenStore?.getToken();

        if (!token) {
            logger.error("[ValidUser] Failed to get auth token");
            return;
        }

        const safetyDelay = uncachedIds.length > 10 ? 400 : 200;

        for (let i = 0; i < uncachedIds.length; i++) {
            const userId = uncachedIds[i];
            try {
                const username = await fetchUsersViaAPI(userId, token, API, Dispatcher);
                logger.log(`[ValidUser] Cached: ${username} (${userId}) [${i+1}/${uncachedIds.length}]`);
            } catch (err) {
                logger.error(`[ValidUser] Failed to fetch ${userId}:`, err);
            }
            
            if (i < uncachedIds.length - 1) {
                await sleep(safetyDelay);
            }
        }
    }

    Dispatcher.dispatch({ type: "JUMP_TO_FIRST_MESSAGE" });
    await sleep(50);
    Dispatcher.dispatch({ type: "JUMP_TO_LAST_MESSAGE" });

    logger.log(`[ValidUser] UI refreshed`);
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