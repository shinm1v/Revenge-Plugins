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
            for (const key of Object.keys(embed)) {
                if (typeof embed[key] === "string") {
                    ids.push(...extractIdsFromText(embed[key]));
                }
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

async function forceUIRefresh(channelId: string, messageId: string, originalMessage: any) {
    const Dispatcher = findByProps("dispatch", "subscribe");
    
    const freshContent = (originalMessage.content || "") + " ";
    let freshEmbeds = [];

    if (originalMessage.embeds && Array.isArray(originalMessage.embeds)) {
        freshEmbeds = originalMessage.embeds.map((embed: any) => {
            const cloned = { ...embed };
            
            for (const key of Object.keys(cloned)) {
                if (typeof cloned[key] === "string" && cloned[key].length > 0) {
                    cloned[key] = cloned[key] + " ";
                }
            }
            
            if (cloned.fields && Array.isArray(cloned.fields)) {
                cloned.fields = cloned.fields.map((f: any) => ({
                    ...f,
                    name: f.name ? f.name + " " : f.name,
                    value: f.value ? f.value + " " : f.value
                }));
            }
            return cloned;
        });
    }

    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: {
            id: messageId,
            channel_id: channelId,
            content: freshContent,
            embeds: freshEmbeds
        }
    });

    await sleep(60);

    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: {
            id: messageId,
            channel_id: channelId,
            content: originalMessage.content || "",
            embeds: originalMessage.embeds || []
        }
    });
}

async function fetchUsersViaGateway(userIds: string[]): Promise<boolean> {
    const GatewayConnection = findByProps("getGateway", "send");
    const SelectedGuildStore = findByProps("getGuildId", "getChannelId");

    const currentGuildId = SelectedGuildStore?.getGuildId?.();
    if (!currentGuildId) return false;

    const ws = GatewayConnection?.getGateway?.();
    if (!ws) return false;

    ws.send(8, {
        guild_id: currentGuildId,
        user_ids: userIds,
        presences: false
    });

    await sleep(400); 
    return true;
}

async function fetchUsersViaAPI(userId: string, token: string, API: any, Dispatcher: any) {
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
        return res.body.username;
    }
    throw new Error("Empty API response body");
}

async function fixUnknownMentions(message: any) {
    const ids = extractAllMentionIds(message);
    const channelId = message.channel_id;
    const messageId = message.id;

    if (ids.length === 0) return;

    const uncachedIds: string[] = [];
    for (const userId of ids) {
        if (!isUserCached(userId)) {
            uncachedIds.push(userId);
        }
    }

    if (uncachedIds.length === 0) {
        if (channelId && messageId) {
            await forceUIRefresh(channelId, messageId, message);
        }
        return;
    }

    const BULK_THRESHOLD = 5;
    let success = false;

    const SelectedGuildStore = findByProps("getGuildId");
    if (uncachedIds.length > BULK_THRESHOLD && SelectedGuildStore?.getGuildId?.()) {
        success = await fetchUsersViaGateway(uncachedIds);
    }

    if (!success) {
        const API = findByProps("get", "post");
        const Dispatcher = findByProps("dispatch", "subscribe");
        const TokenStore = findByProps("getToken");
        const token = TokenStore?.getToken();

        if (!token) return;

        const safetyDelay = uncachedIds.length > 10 ? 450 : 250;

        for (let i = 0; i < uncachedIds.length; i++) {
            const userId = uncachedIds[i];
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
        await forceUIRefresh(channelId, messageId, message);
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
                        (c: any) => Array.isArray(c) && c?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) {
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
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, fixButton)
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
