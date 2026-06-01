import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");

const fetched = new Set();
let unpatch;

async function resolveAndPatch(message) {
    const mentions = message.mentions ?? [];
    const unknown = mentions.filter(u => !u.username);
    if (!unknown.length) return;

    for (const mention of unknown) {
        const id = mention.id;
        if (fetched.has(id)) continue;
        fetched.add(id);

        try {
            const res = await RestAPI.get({
                url: `/users/${id}/profile?with_mutual_guilds=false&with_mutual_friends=false&with_mutual_friends_count=false${message.guild_id ? `&guild_id=${message.guild_id}` : ""}`
            });

            const user = res?.body?.user;
            if (!user) continue;

            mention.username = user.username;
            mention.discriminator = user.discriminator;
            mention.avatar = user.avatar;
            mention.global_name = user.global_name ?? user.username;
        } catch (e) {
            console.error(`[ValidUser] fetch failed for ${id}:`, e);
        }
    }

    FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: { ...message, mentions },
        channelId: message.channel_id,
        otherPluginBypass: true,
    });
}

export const onLoad = () => {
    unpatch = before("dispatch", FluxDispatcher, args => {
        const ev = args[0];
        if (!ev?.type) return;

        if (ev.type === "MESSAGE_CREATE") {
            const msg = ev.message;
            if (msg) resolveAndPatch(msg);
        }

        if (ev.type === "LOAD_MESSAGES_SUCCESS") {
            for (const msg of ev.messages ?? []) {
                resolveAndPatch(msg);
            }
        }
    });
};

export const onUnload = () => {
    unpatch?.();
    fetched.clear();
};
