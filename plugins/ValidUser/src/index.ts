import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");
const GuildMemberStore = findByProps("getMember", "getTrueMember");
const MessageStore = findByProps("getMessage", "getMessages");

const cachedMembers = new Set<string>();
let unpatch: () => void;

function isCached(id: string, guildId: string): boolean {
    if (cachedMembers.has(`${id}-${guildId}`)) return true;
    const user = UserStore?.getUser(id);
    if (!user?.username) return false;
    const member = GuildMemberStore?.getMember(guildId, id);
    return !!member;
}

async function fetchUser(id: string, guildId: string): Promise<void> {
    const res = await RestAPI.get({ url: `/users/${id}` });
    const user = res?.body;
    if (user) {
        FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
        cachedMembers.add(`${id}-${guildId}`);
    }
}

async function fetchMember(id: string, guildId: string): Promise<void> {
    const res = await RestAPI.get({
        url: `/users/${id}/profile?with_mutual_friends_count=false&with_mutual_guilds=false&guild_id=${guildId}`
    });
    const body = res?.body;
    if (!body) return;

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });

    if (body.guild_member) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBER_PROFILE_UPDATE",
            guildId,
            guildMember: body.guild_member,
        });
    }
    cachedMembers.add(`${id}-${guildId}`);
}

async function fetchProfile(id: string, guildId: string, retry = false): Promise<boolean> {
    if (isCached(id, guildId)) return false;

    try {
        if (retry) {
            await fetchUser(id, guildId);
        } else {
            await fetchMember(id, guildId);
        }
        return false;
    } catch (e: any) {
        if (e?.status === 429) {
            console.error(`[ValidUser] Rate limited on ${id}, aborting batch`);
            return true;
        } else if ((e?.status === 403 || e?.status === 404) && !retry) {
            return fetchProfile(id, guildId, true);
        } else {
            cachedMembers.add(`${id}-${guildId}`);
            return false;
        }
    }
}

function getIdsFromContent(content: string): string[] {
    return [...(content ?? "").matchAll(/<@!?(\d+)>/g)]
        .map(m => m[1])
        .filter((id, i, arr) => arr.indexOf(id) === i);
}

async function processMessage(message: any): Promise<void> {
    const guildId = message.guild_id;
    const channelId = message.channel_id;
    const messageId = message.id;
    
    if (!guildId) return;

    const fromContent = getIdsFromContent(message.content ?? "");
    const fromMentions = (message.mentions ?? []).map((u: any) => u.id);
    const allIds = [...new Set([...fromContent, ...fromMentions])];

    if (allIds.length === 0) return;

    // Find which users need fetching
    const needsFetch = allIds.filter(id => !isCached(id, guildId));
    if (needsFetch.length === 0) return;

    // Fetch all missing users
    for (const id of needsFetch) {
        const abort = await fetchProfile(id, guildId);
        if (abort) break;
    }

    // After all fetches complete, re-render the message
    const msg = MessageStore?.getMessage(channelId, messageId);
    if (msg) {
        FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: msg,
        });
    }
}

export const onLoad = () => {
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
    unpatch?.();
    cachedMembers.clear();
};
