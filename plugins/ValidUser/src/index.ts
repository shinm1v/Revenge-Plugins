import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("get", "post");

const fetched = new Set<string>();
let unpatch: () => void;

async function resolveUser(id: string): Promise<void> {
    if (fetched.has(id)) return;
    fetched.add(id);

    try {
        const res = await RestAPI.get({ url: `/users/${id}` });
        if (res?.body) {
            FluxDispatcher.dispatch({ type: "USER_UPDATE", user: res.body });
        }
    } catch (e: any) {
        if (e?.status === 429) {
            console.error(`[ValidUser] Rate limited, aborting`);
            fetched.delete(id); // allow retry later
        }
    }
}

function getIds(message: any): string[] {
    const fromMentions = (message.mentions ?? []).map((u: any) => u.id);
    const fromContent = [...(message.content ?? "").matchAll(/<@!?(\d+)>/g)].map((m: any) => m[1]);
    return [...new Set([...fromMentions, ...fromContent])];
}

async function processMessage(message: any): Promise<void> {
    for (const id of getIds(message)) {
        await resolveUser(id);
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
    fetched.clear();
};