import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");
const GuildMemberStore = findByProps("getMember", "getTrueMember");
const GuildStore = findByProps("getGuild", "getGuilds");

const cachedMembers = new Set<string>();
let unpatch: () => void;

function isCached(id: string, guildId: string): boolean {
    return cachedMembers.has(`${id}-${guildId}`);
}

async function fetchApplicationIdentities(id: string): Promise<void> {
    try {
        console.log(`[ValidUser] Fetching application identities for ${id}`);
        await RestAPI.get({ url: `/users/${id}/application-identities?with_profiles=true` });
    } catch (e: any) {
        if (e?.status !== 404) {
            console.warn(`[ValidUser] Failed to fetch app identities for ${id}:`, e?.status);
        }
    }
}

async function fetchUserNotes(id: string): Promise<void> {
    try {
        console.log(`[ValidUser] Fetching user notes for ${id}`);
        await RestAPI.get({ url: `/users/@me/notes/${id}` });
    } catch (e: any) {
        if (e?.status !== 404) {
            console.warn(`[ValidUser] Failed to fetch notes for ${id}:`, e?.status);
        }
    }
}

async function fetchUser(id: string, guildId: string): Promise<void> {
    console.log(`[ValidUser] Fetching user ${id} using /users endpoint`);
    const res = await RestAPI.get({ url: `/users/${id}` });
    const user = res?.body;
    if (user) {
        console.log(`[ValidUser] Successfully fetched user ${id}:`, user.username);
        FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
        cachedMembers.add(`${id}-${guildId}`);
        FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE" });
    } else {
        console.warn(`[ValidUser] No user data returned for ${id}`);
    }
}

async function fetchMember(id: string, guildId: string): Promise<void> {
    console.log(`[ValidUser] Fetching member ${id} from guild ${guildId}`);
    
    const res = await RestAPI.get({
        url: `/users/${id}/profile?type=action_sheet&with_mutual_guilds=true&with_mutual_friends=true&with_mutual_friends_count=false&guild_id=${guildId}`
    });
    const body = res?.body;
    if (!body) {
        console.warn(`[ValidUser] No profile data returned for ${id}`);
        return;
    }

    console.log(`[ValidUser] Successfully fetched profile for ${id}:`, body.user?.username);
    
    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });

    if (body.guild_member) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBER_PROFILE_UPDATE",
            guildId,
            guildMember: body.guild_member,
        });
    }

    if (body.mutual_guilds) {
        FluxDispatcher.dispatch({
            type: "MUTUAL_GUILDS_FETCH_SUCCESS",
            mutual_guilds: body.mutual_guilds,
        });
    }

    if (body.mutual_friends) {
        FluxDispatcher.dispatch({
            type: "MUTUAL_FRIENDS_FETCH_SUCCESS",
            mutual_friends: body.mutual_friends,
        });
    }

    cachedMembers.add(`${id}-${guildId}`);

    await Promise.all([
        fetchApplicationIdentities(id),
        fetchUserNotes(id)
    ]);

    console.log(`[ValidUser] Forcing re-render for ${id}`);
    FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE" });
}

function findMutualGuild(id: string): string | null {
    const guilds = GuildStore?.getGuilds?.();
    if (!guilds) return null;

    for (const guildId of Object.keys(guilds)) {
        const member = GuildMemberStore?.getMember(guildId, id);
        if (member) {
            console.log(`[ValidUser] Found mutual guild ${guildId} for user ${id}`);
            return guildId;
        }
    }
    return null;
}

async function fetchProfile(id: string, guildId: string, retry = false): Promise<boolean> {
    if (isCached(id, guildId)) {
        console.log(`[ValidUser] User ${id} already cached for guild ${guildId}`);
        return false;
    }

    try {
        if (retry) {
            console.log(`[ValidUser] Retry attempt for ${id} - using fallback fetch`);
            await fetchUser(id, guildId);
        } else {
            await fetchMember(id, guildId);
        }
        return false;
    } catch (e: any) {
        console.error(`[ValidUser] Error fetching user ${id}:`, e?.status, e?.body || e?.message);
        
        if (e?.status === 429) {
            console.error(`[ValidUser] Rate limited on ${id}, aborting batch`);
            return true;
        } else if ((e?.status === 403 || e?.status === 404) && !retry) {
            console.log(`[ValidUser] Got ${e?.status} for ${id}, trying mutual guild lookup...`);
            const mutualGuild = findMutualGuild(id);
            if (mutualGuild && mutualGuild !== guildId) {
                try {
                    await fetchMember(id, mutualGuild);
                    cachedMembers.add(`${id}-${guildId}`);
                    return false;
                } catch (e2: any) {
                    console.error(`[ValidUser] Mutual guild fetch also failed:`, e2?.status);
                    if (e2?.status === 429) return true;
                }
            }
            return fetchProfile(id, guildId, true);
        } else {
            console.log(`[ValidUser] Marking ${id} as cached after error`);
            cachedMembers.add(`${id}-${guildId}`);
            return false;
        }
    }
}

function getIdsFromContent(content: string): string[] {
    const matches = [...(content ?? "").matchAll(/<@!?(\d+)>/g)];
    const ids = matches.map(m => m[1]).filter((id, i, arr) => arr.indexOf(id) === i);
    if (ids.length > 0) {
        console.log(`[ValidUser] Found mention IDs in content:`, ids);
    }
    return ids;
}

async function processMessage(message: any): Promise<void> {
    const guildId = message.guild_id;
    if (!guildId) return;

    const fromContent = getIdsFromContent(message.content ?? "");
    const fromMentions = (message.mentions ?? []).map((u: any) => u.id);
    const allIds = [...new Set([...fromContent, ...fromMentions])];

    if (allIds.length === 0) return;

    console.log(`[ValidUser] Processing message with user IDs:`, allIds);

    for (const id of allIds) {
        if (isCached(id, guildId)) continue;
        const abort = await fetchProfile(id, guildId);
        if (abort) break;
    }
}

export const onLoad = () => {
    console.log(`[ValidUser] Plugin loaded - auto-fetching all mentions`);
    
    unpatch = before("dispatch", FluxDispatcher, (args: any[]) => {
        const ev = args[0];
        if (!ev?.type) return;

        if (ev.type === "MESSAGE_CREATE") {
            processMessage(ev.message);
        }

        if (ev.type === "LOAD_MESSAGES_SUCCESS") {
            console.log(`[ValidUser] Loading ${ev.messages?.length || 0} messages`);
            for (const msg of ev.messages ?? []) {
                processMessage(msg);
            }
        }
    });
};

export const onUnload = () => {
    console.log(`[ValidUser] Plugin unloaded`);
    unpatch?.();
    cachedMembers.clear();
};
