import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");

let unpatch: () => void;

async function fetchUser(id: string): Promise<void> {
    try {
        const res = await RestAPI.get({ url: `/users/${id}` });
        const user = res?.body;
        if (user) {
            // Inject directly into UserStore
            FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
        }
    } catch (e: any) {
        console.warn(`[ValidUser] Failed to fetch user ${id}:`, e?.status);
    }
}

function getUnknownMentionIds(content: string): string[] {
    // Extract IDs from mentions in the content
    return [...(content ?? "").matchAll(/<@!?(\d+)>/g)]
        .map(m => m[1])
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .filter(id => {
            // Only return IDs that are NOT in UserStore yet
            const user = UserStore?.getUser(id);
            return !user?.username;
        });
}

async function processMessage(message: any): Promise<void> {
    const guildId = message.guild_id;
    if (!guildId) return;

    // Find unknown mentions in this message
    const unknownIds = getUnknownMentionIds(message.content ?? "");
    if (unknownIds.length === 0) return;

    // Fetch all unknown users
    await Promise.all(unknownIds.map(id => fetchUser(id)));

    // Re-render the message to show resolved mentions
    const channelId = message.channel_id;
    const messageId = message.id;
    
    FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: { ...message },
    });
}

export const onLoad = () => {
    console.log(`[ValidUser] Plugin loaded`);
    
    unpatch = before("dispatch", FluxDispatcher, (args: any[]) => {
        const ev = args[0];
        if (!ev?.type) return;

        if (ev.type === "MESSAGE_CREATE") {
            processMessage(ev.message);
        }

        if (ev.type === "LOAD_MESSAGES_SUCCESS") {
            for (const msg of ev.messages ?? []) {
                processMessage(msg);
            }
        }
    });
};

export const onUnload = () => {
    console.log(`[ValidUser] Plugin unloaded`);
    unpatch?.();
};
