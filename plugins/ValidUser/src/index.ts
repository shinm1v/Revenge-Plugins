import { findByProps } from "@vendetta/metro";
import { patcher } from "@vendetta";

// Acquire core React Native / Webpack modules
const API = findByProps("get", "post");
const Dispatcher = findByProps("dispatch", "subscribe");
const UserStore = findByProps("getUser", "getCurrentUser");

// Filter for internal layout modules
// Discord's React Native engine usually packages this inside a "PureComponent" or "NameTag" / "Mention" hook.
const PureRenderModules = findByProps("UserMention", "default") || findByProps("Mention") || findByProps("NameTag");

// Tracking cache to prevent aggressive rate-limiting (429) from Discord
const executionQueue = new Set();
let activePatches = [];

/**
 * Asynchronously pulls the missing user from Discord's servers 
 * and updates the Dispatcher cache to force components to rerender.
 */
async function triggerUserResolution(userId) {
    if (!userId || UserStore.getUser(userId) || executionQueue.has(userId)) return;

    executionQueue.add(userId);
    try {
        // GET Request to pull the raw user payload
        const response = await API.get({ url: `/users/${userId}` });
        
        if (response && response.body) {
            // Dispatches to the internal storage layer
            Dispatcher.dispatch({
                type: "USER_UPDATE",
                user: response.body
            });
        }
    } catch (error) {
        console.error(`[RevengeUnknownFix] Failed resolving ID ${userId}:`, error);
    } finally {
        // Clear queue tracking regardless of outcome
        executionQueue.delete(userId);
    }
}

export default {
    onLoad: () => {
        if (!PureRenderModules) {
            console.error("[RevengeUnknownFix] Target render modules could not be located in Webpack bundle.");
            return;
        }

        // We target the default hook layout or structural sub-components
        const targetHook = PureRenderModules.default ? "default" : Object.keys(PureRenderModules)[0];

        const mentionPatch = patcher.before(targetHook, PureRenderModules, (args) => {
            const renderProps = args[0];
            if (!renderProps) return;

            // Extract the user ID from common mention/nametag structural elements
            const extractedId = renderProps.userId || renderProps.id || (renderProps.message && renderProps.message.authorId);

            if (extractedId) {
                const localUser = UserStore.getUser(extractedId);
                
                // If local cache returns null/undefined, it means they are currently an "unknown-user"
                if (!localUser) {
                    triggerUserResolution(extractedId);
                }
            }
        });

        activePatches.push(mentionPatch);
    },

    onUnload: () => {
        // Clear all patches cleanly to prevent app hangs or memory leak panics on plug reload
        for (const unpatch of activePatches) {
            if (typeof unpatch === "function") unpatch();
        }
        activePatches = [];
        executionQueue.clear();
    }
};
