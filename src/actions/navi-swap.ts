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

export interface SwapPayload extends Content {
    from_token: string;
    to_token: string;
    amount: string | number;
}

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "from_token": "sui",
    "to_token": "usdc",
    "amount": "1"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the swap operation:
- Source token to swap from
- Destination token to swap to
- Amount of source token to swap

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "NAVI_SWAP",
    similes: ["NAVI_EXCHANGE", "NAVI_CONVERT"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating navi swap operation from user:", message.userId);
        return true;
    },
    description: "Swap tokens through Navi protocol",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting NAVI_SWAP handler...");

        const service = runtime.getService<NaviService>(ServiceType.TRANSCRIPTION);

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const swapSchema = z.object({
            from_token: z.string(),
            to_token: z.string(),
            amount: z.union([z.string(), z.number()]),
        });

        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });

        const content = await generateObject({
            runtime,
            context: swapContext,
            schema: swapSchema,
            modelClass: ModelClass.SMALL,
        });

        const swapContent = content.object as SwapPayload;
        elizaLogger.info("Swap content:", swapContent);

        try {
            // Execute the swap
            const result = await service.swap(
                swapContent.from_token,
                swapContent.to_token,
                swapContent.amount
            );

            callback({
                text: `Successfully swapped tokens:
                - From: ${swapContent.from_token}
                - To: ${swapContent.to_token}
                - Amount: ${swapContent.amount}
                - Transaction: ${JSON.stringify(result)}`,
                content: swapContent,
            });

            return true;
        } catch (error) {
            elizaLogger.error("Error in swap operation:", error);
            callback({
                text: `Failed to swap tokens: ${error}`,
                content: { error: "Failed to swap tokens" },
            });
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Swap 1 SUI to USDC",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 SUI to USDC through Navi protocol...",
                    action: "NAVI_SWAP",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully swapped 1 SUI to USDC",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Exchange 100 USDC for SUI",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you exchange 100 USDC for SUI through Navi protocol...",
                    action: "NAVI_SWAP",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully exchanged 100 USDC for SUI",
                },
            },
        ],
    ] as ActionExample[][],
} as Action; 