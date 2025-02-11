import {
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    ServiceType,
    State,
    composeContext,
    elizaLogger,
    generateObject,
    type Action,
} from "@elizaos/core";
import { NaviService } from "../services/navi";
import { z } from "zod";

export interface LendPayload extends Content {
    operation: "supply" | "withdraw" | "borrow" | "repay";
    token_symbol: string;
    amount: string | number;
}

const lendTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "operation": "supply",
    "token_symbol": "sui",
    "amount": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the lending operation:
- Operation type (supply, withdraw, borrow, or repay)
- Token symbol
- Amount to supply/withdraw/borrow/repay

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "NAVI_LEND",
    similes: ["NAVI_SUPPLY", "NAVI_WITHDRAW", "NAVI_BORROW", "NAVI_REPAY"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating navi lending operation from user:", message.userId);
        return true;
    },
    description: "Supply, withdraw, borrow, or repay tokens from Navi protocol",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting NAVI_LEND handler...");

        const service = runtime.getService<NaviService>(ServiceType.TRANSCRIPTION);

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const lendSchema = z.object({
            operation: z.enum(["supply", "withdraw", "borrow", "repay"]),
            token_symbol: z.string(),
            amount: z.union([z.string(), z.number()]),
        });

        const lendContext = composeContext({
            state,
            template: lendTemplate,
        });

        const content = await generateObject({
            runtime,
            context: lendContext,
            schema: lendSchema,
            modelClass: ModelClass.SMALL,
        });

        const lendContent = content.object as LendPayload;
        elizaLogger.info("Lend content:", lendContent);

        try {
            // Get token metadata
            const tokenInfo = {
                symbol: lendContent.token_symbol.toUpperCase(),
                address: "", // This will be filled by the SDK
                decimal: 9,
            };

            // Get health factor before operation
            const healthFactor = await service.getHealthFactor(service.getAddress());
            elizaLogger.info("Current health factor:", healthFactor);

            // Get dynamic health factor for the operation
            const dynamicHealthFactor = await service.getDynamicHealthFactor(
                service.getAddress(),
                tokenInfo,
                lendContent.operation === "supply" ? Number(lendContent.amount) : 0,
                lendContent.operation === "borrow" ? Number(lendContent.amount) : 0,
                lendContent.operation === "supply" || lendContent.operation === "borrow"
            );
            elizaLogger.info("Dynamic health factor:", dynamicHealthFactor);

            // Execute the operation
            const result = await service.executeOperation(
                lendContent.operation,
                lendContent.token_symbol,
                lendContent.amount
            );

            callback({
                text: `Successfully executed ${lendContent.operation} operation:
                - Token: ${lendContent.token_symbol}
                - Amount: ${lendContent.amount}
                - Current Health Factor: ${healthFactor}
                - Projected Health Factor: ${dynamicHealthFactor}
                - Transaction: ${JSON.stringify(result)}`,
                content: lendContent,
            });

            return true;
        } catch (error) {
            elizaLogger.error("Error in lending operation:", error);
            callback({
                text: `Failed to perform ${lendContent.operation} operation: ${error}`,
                content: { error: `Failed to ${lendContent.operation}` },
            });
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to supply 1 SUI to Navi",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you supply 1 SUI to Navi protocol...",
                    action: "NAVI_LEND",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully supplied 1 SUI to Navi protocol",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Withdraw 0.5 SUI from Navi",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you withdraw 0.5 SUI from Navi protocol...",
                    action: "NAVI_LEND",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully withdrew 0.5 SUI from Navi protocol",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Borrow 100 USDC from Navi",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you borrow 100 USDC from Navi protocol...",
                    action: "NAVI_LEND",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully borrowed 100 USDC from Navi protocol",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Repay 50 USDC to Navi",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you repay 50 USDC to Navi protocol...",
                    action: "NAVI_LEND",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully repaid 50 USDC to Navi protocol",
                },
            },
        ],
    ] as ActionExample[][],
} as Action; 