import { registerCommand } from "@vendetta/commands";
import { testCommand } from "./commands/test";

let registeredCommands: Array<() => void> = [];

export default {
    onLoad: () => {
        try {
            registeredCommands.push(registerCommand(testCommand));
            console.log("[InfoCommands] Test command registered");
        } catch (e) {
            console.error("[InfoCommands] Failed:", e);
        }
    },
    onUnload: () => {
        for (const unregister of registeredCommands) {
            try {
                unregister();
            } catch (e) {}
        }
        registeredCommands = [];
    },
};