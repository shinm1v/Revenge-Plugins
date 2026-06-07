import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");
const GuildMemberStore = findByProps("getMember", "getTrueMember");
const GuildStore = findByProps("getGuild", "getGuilds");
const NavigationModule = findByProps("openUserProfile");

const cachedMembers = new Set<string>();
let unpatch: () => void;
let renderUnpatch: (() => void)[] = [];

function isCached(id: string, guildId: string): boolean {
    return cachedMembers.has(`${id}-${guildId}`);
}

async function fetchUser(id: string, guildId: string): Promise<void> {
    console.log(`[ValidUser] Fetching user ${id} using /users endpoint`);
    const res = await RestAPI.get({ url: `/users/${id}` });
    const user = res?.body;
    if (user) {
        console.log(`[ValidUser] Successfully fetched user ${id}:`, user.username);
        FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
        FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", user });
        cachedMembers.add(`${id}-${guildId}`);
    } else {
        console.warn(`[ValidUser] No user data returned for ${id}`);
    }
}

async function fetchMember(id: string, guildId: string): Promise<void> {
    console.log(`[ValidUser] Fetching member ${id} from guild ${guildId}`);
    const res = await RestAPI.get({
        url: `/users/${id}/profile?with_mutual_friends_count=false&with_mutual_guilds=false&guild_id=${guildId}`
    });
    const body = res?.body;
    if (!body) {
        console.warn(`[ValidUser] No profile data returned for ${id}`);
        return;
    }

    console.log(`[ValidUser] Successfully fetched profile for ${id}:`, body.user?.username);
    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });
    FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", user: body.user });

    if (body.guild_member) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBER_PROFILE_UPDATE",
            guildId,
            guildMember: body.guild_member,
        });
    }
    cachedMembers.add(`${id}-${guildId}`);
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

// Patch mention component to fetch on click instead of automatically
function patchMentionClick() {
    try {
        const MentionModule = findByProps("Mention", "MentionTypes");
        if (!MentionModule?.Mention) {
            console.warn("[ValidUser] Could not find Mention component");
            return;
        }

        renderUnpatch.push(before("type", MentionModule.Mention, (args: any[]) => {
            const props = args[0];
            const userId = props?.userId;
            const guildId = props?.guildId;
            
            if (userId && guildId) {
                // Override onClick to fetch user before opening profile
                const originalOnClick = props?.onClick;
                props.onClick = async (e: any) => {
                    e?.stopPropagation?.();
                    
                    const user = UserStore?.getUser(userId);
                    if (!user?.username) {
                        console.log(`[ValidUser] Mention clicked for ${userId}, fetching data...`);
                        await fetchProfile(userId, guildId);
                    }
                    
                    // Open user profile
                    if (NavigationModule?.openUserProfile) {
                        NavigationModule.openUserProfile({ userId, guildId });
                    }
                };
            }
        }));
    } catch (e) {
        console.warn("[ValidUser] Failed to patch mention click:", e);
    }
}

export const onLoad = () => {
    console.log(`[ValidUser] Plugin loaded - fetch on click only`);
    
    // Patch mention components to fetch on click
    patchMentionClick();
};

export const onUnload = () => {
    console.log(`[ValidUser] Plugin unloaded`);
    unpatch?.();
    renderUnpatch.forEach(p => p?.());
    renderUnpatch = [];
    cachedMembers.clear();
};
