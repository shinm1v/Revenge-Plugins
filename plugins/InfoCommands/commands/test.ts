export const testCommand = {
    name: "test",
    displayName: "test",
    description: "Test command",
    displayDescription: "Test command",
    options: [],
    execute: async (args: any[], ctx: any) => {
        try {
            const API = require("@vendetta/metro").findByProps("get", "post");
            const response = await API.get({ url: "/users/1381008677301129257" });
            
            return {
                type: 4,
                data: {
                    content: `User found: ${response.body.username}`,
                    flags: 64
                }
            };
        } catch (error) {
            console.error("[Test] Error:", error);
            return {
                type: 4,
                data: {
                    content: `Error: ${error.message}`,
                    flags: 64
                }
            };
        }
    },
    applicationId: "-1",
    inputType: 1,
    type: 1,
};