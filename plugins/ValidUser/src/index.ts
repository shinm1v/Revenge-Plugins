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

async function forceUIRefresh(channelId: string, messageId: string, content: string) {
    logger.log("[ValidUser] forceUIRefresh called");
    const Dispatcher = findByProps("dispatch", "subscribe");
    const freshContent = content + " ";

    logger.log("[ValidUser] Dispatching first MESSAGE_UPDATE with +space");
    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: {
            id: messageId,
            channel_id: channelId,
            content: freshContent 
        }
    });

    await sleep(50);
    logger.log("[ValidUser] Dispatching second MESSAGE_UPDATE restoring original");
    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: {
            id: messageId,
            channel_id: channelId,
            content: content 
        }
    });
    logger.log("[ValidUser] forceUIRefresh complete");
}

async function fetchUsersViaGateway(userIds: string[]): Promise<boolean> {
    logger.log(`[ValidUser] fetchUsersViaGateway called for ${userIds.length} users`);
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

    logger.log(`[ValidUser] Sending gateway request for ${userIds.length} users`);
    ws.send(8, {
        guild_id: currentGuildId,
        user_ids: userIds,
        presences: false
    });

    await sleep(400);
    logger.log("[ValidUser] Gateway request complete");
    return true;
}

async function fetchUsersViaAPI(userId: string, token: string, API: any, Dispatcher: any) {
    logger.log(`[ValidUser] fetchUsersViaAPI called for ${userId}`);
    const cleanToken = typeof token === "string" ? token : (token as any)?.token || "";

    const res = await API.get({
        url: `/users/${userId}`,
        headers: {
            Authorization: cleanToken.trim()
        }
    });

    if (res.body) {
        Dispatcher.dispatch({
            type: "USER_UPDATE",
            user: res.body
        });
        logger.log(`[ValidUser] Successfully fetched and cached user: ${res.body.username}`);
        return res.body.username;
    }
    logger.error("[ValidUser] Empty API response body");
    throw new Error("Empty API response body");
}

async function fixUnknownMentions(message: any) {
    logger.log("[ValidUser] fixUnknownMentions called");
    const ids = extractAllMentionIds(message);
    const channelId = message.channel_id;
    const messageId = message.id;

    logger.log(`[ValidUser] Found ${ids.length} mention(s) in message`);
    if (ids.length === 0) return;

    const uncachedIds: string[] = [];
    for (const userId of ids) {
        const cached = isUserCached(userId);
        logger.log(`[ValidUser] User ${userId} cached: ${cached}`);
        if (!cached) {
            uncachedIds.push(userId);
        }
    }

    logger.log(`[ValidUser] ${uncachedIds.length} user(s) not cached`);

    if (uncachedIds.length === 0) {
        logger.log("[ValidUser] All users cached, refreshing UI only");
        if (channelId && messageId) {
            await forceUIRefresh(channelId, messageId, message.content);
        }
        return;
    }

    const BULK_THRESHOLD = 5;
    let success = false;

    const SelectedGuildStore = findByProps("getGuildId");
    if (uncachedIds.length > BULK_THRESHOLD && SelectedGuildStore?.getGuildId?.()) {
        logger.log(`[ValidUser] Attempting gateway bulk fetch for ${uncachedIds.length} users`);
        success = await fetchUsersViaGateway(uncachedIds);
    } else {
        logger.log(`[ValidUser] Bulk threshold not met, skipping gateway`);
    }

    if (!success) {
        logger.log(`[ValidUser] Falling back to individual API requests for ${uncachedIds.length} users`);
        const API = findByProps("get", "post");
        const Dispatcher = findByProps("dispatch", "subscribe");
        const TokenStore = findByProps("getToken");
        const token = TokenStore?.getToken();

        if (!token) {
            logger.error("[ValidUser] No token available");
            return;
        }

        const safetyDelay = uncachedIds.length > 10 ? 450 : 250;
        logger.log(`[ValidUser] Using delay of ${safetyDelay}ms between requests`);

        for (let i = 0; i < uncachedIds.length; i++) {
            const userId = uncachedIds[i];
            logger.log(`[ValidUser] Fetching user ${i+1}/${uncachedIds.length}: ${userId}`);
            try {
                await fetchUsersViaAPI(userId, token, API, Dispatcher);
            } catch (err) {
                logger.error(`[ValidUser] Fetch Failed for ${userId}:`, err);
            }
            if (i < uncachedIds.length - 1) {
                await sleep(safetyDelay);
            }
        }
    }

    if (channelId && messageId) {
        logger.log("[ValidUser] Final UI refresh after fetching all users");
        await forceUIRefresh(channelId, messageId, message.content);
    }
    logger.log("[ValidUser] fixUnknownMentions complete");
}

let unpatchOpenLazy: (() => void) | null = null;

export default {
    onLoad() {
        logger.log("[ValidUser] Plugin loaded");
        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const message = msg.message;
            const ids = extractAllMentionIds(message);

            logger.log(`[ValidUser] ActionSheet opened, found ${ids.length} mention(s)`);
            if (ids.length === 0) return;

            comp.then((instance: any) => {
                const unpatch = after("default", instance, (_: any, component: any) => {
                    React.useEffect(() => () => { unpatch(); }, []);

                    logger.log("[ValidUser] Looking for ActionSheetRowGroup");
                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
                        logger.warn("[ValidUser] No ActionSheetRowGroup found");
                        return;
                    }
                    logger.log(`[ValidUser] Found ${groups.length} ActionSheetRowGroup(s)`);

                    const fixButton = React.createElement(ActionSheetRow, {
                        label: ids.length === 1 ? "Fix Unknown Mention" : `Fix ${ids.length} Unknown Mentions`,
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: MentionIcon,
                        }),
                        onPress: () => {
                            logger.log("[ValidUser] Button pressed");
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

                        logger.log(`[ValidUser] Inserting button into group ${gi}`);
                        groupChildren.unshift(fixButton);
                        inserted = true;
                        break;
                    }

                    if (!inserted) {
                        logger.warn("[ValidUser] No suitable group children found, adding as new group");
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, fixButton)
                        );
                    }
                    logger.log("[ValidUser] Button insertion complete");
                });
            });
        });
    },

    onUnload() {
        logger.log("[ValidUser] Plugin unloaded");
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
    },
};