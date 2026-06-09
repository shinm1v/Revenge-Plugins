import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");

let unpatch: () => void;
const fetchingCache = new Set<string>();

async function fetchAndCacheUser(id: string): Promise<void> {
    if (!id || UserStore?.getUser(id) || fetchingCache.has(id)) return;

    fetchingCache.add(id);
    try {
        const res = await RestAPI.get({ url: `/users/${id}` });
        
        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user: res.body
        });
        
        console.log(`[ValidUser] Cached user ${id}: ${res.body?.username}`);
    } catch (err: any) {
        console.error(`[ValidUser] Failed to resolve user ${id}:`, err?.status);
    } finally {
        fetchingCache.delete(id);
    }
}

function extractUserIdFromMention(mention: any): string | null {
    // Handle different mention formats
    if (typeof mention === "string" && mention.match(/^\d+$/)) {
        return mention;
    }
    if (mention?.userId) return mention.userId;
    if (mention?.id) return mention.id;
    return null;
}

export const onLoad = () => {
    console.log(`[ValidUser] Plugin loaded - hooking mention taps`);
    
    // Try to find and patch mention tap handlers
    try {
        const MentionModule = findByProps("Mention") || findByProps("UserMention");
        
        if (MentionModule?.default) {
            unpatch = before("default", MentionModule, function(args: any[]) {
                const props = args[0];
                if (!props) return;

                const userId = extractUserIdFromMention(props);
                
                if (userId && !UserStore?.getUser(userId)) {
                    // Hook the onPress/onClick handler
                    const originalOnPress = props?.onPress || props?.onClick;
                    
                    props.onPress = props.onClick = async function(e: any) {
                        // Fetch user before opening profile
                        await fetchAndCacheUser(userId);
                        
                        // Call original handler if it exists
                        if (typeof originalOnPress === "function") {
                            return originalOnPress.call(this, e);
                        }
                    };
                }
            });
        }
    } catch (err) {
        console.warn("[ValidUser] Could not patch mention component:", err);
    }
};

export const onUnload = () => {
    console.log(`[ValidUser] Plugin unloaded`);
    unpatch?.();
    fetchingCache.clear();
};
