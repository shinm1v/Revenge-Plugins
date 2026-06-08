import { findByProps } from "@vendetta/metro";
import { patcher } from "@vendetta";

// Acquire essential metro modules
const API = findByProps("get", "post");
const Dispatcher = findByProps("dispatch", "subscribe");
const UserStore = findByProps("getUser", "getCurrentUser");

// Tracking set to ensure we don't spam requests for the same ID 
const fetchingCache = new Set();
let patches = [];

/**
 * Force fetches a user profile via API and populates the local Discord UserStore.
 */
async function fetchAndCacheUser(id) {
    if (!id || UserStore.getUser(id) || fetchingCache.has(id)) return;

    fetchingCache.add(id);
    try {
        const res = await API.get({ url: `/users/${id}` });
        
        Dispatcher.dispatch({
            type: "USER_UPDATE",
            user: res.body
        });
    } catch (err) {
        console.error(`[UserFetch] Failed to resolve user ${id}:`, err);
    } finally {
        fetchingCache.delete(id);
    }
}

export default {
    onLoad: () => {
        // Find the internal component responsible for rendering user mentions
        // Depending on Discord's bundle build, this is often found via filter or specific props
        const MentionModule = findByProps("UserMention", "default") || findByProps("Mention");

        if (!MentionModule) return;

        // Patch the Mention renderer component
        const patch = patcher.before("default", MentionModule, (args) => {
            const props = args[0];
            if (!props || !props.userId) return;

            const cachedUser = UserStore.getUser(props.userId);
            
            // If the user isn't locally cached, fetch them asynchronously 
            if (!cachedUser) {
                fetchAndCacheUser(props.userId);
            }
        });

        patches.push(patch);
    },

    onUnload: () => {
        // Clean up patches to prevent memory leaks and avoid crashing the client on reload
        for (const unpatch of patches) {
            if (typeof unpatch === "function") unpatch();
        }
        patches = [];
        fetchingCache.clear();
    }
};
