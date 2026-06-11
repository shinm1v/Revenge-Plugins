import { registerCommand } from "@vendetta/commands";
import { storage } from "@vendetta/plugin";
import { userInfoCommand } from "./commands/userinfo";
import { serverInfoCommand } from "./commands/serverinfo";
import { inviteInfoCommand } from "./commands/inviteinfo";

storage.enabledCommands ??= {
    userinfo: true,
    serverinfo: true,
    inviteinfo: true,
};

const commands = [
    userInfoCommand,
    serverInfoCommand,
    inviteInfoCommand,
];

let registeredCommands: Array<() => void> = [];

export default {
    onLoad: () => {
        for (const command of commands) {
            try {
                registeredCommands.push(registerCommand(command));
                console.log(`[UserServerInfo] Registered: ${command.name}`);
            } catch (e) {
                console.error(`[UserServerInfo] Failed to register ${command.name}:`, e);
            }
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
