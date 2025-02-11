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

export interface PoolInfoPayload extends Content {
    token_symbol?: string;
}

const poolInfoTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "token_symbol": "sui"
}
\`\`\`

{{recentMessages}}

Given the recent messages, extract the following information about the requested pool information:
- Token symbol (if specified)

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "GET_NAVI_POOL_INFO",
    similes: ["VIEW_NAVI_POOL", "CHECK_NAVI_POOL"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating navi pool info request from user:", message.userId);
        return true;
    },
    description: "Get information about Navi protocol pools",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting GET_NAVI_POOL_INFO handler...");

        const service = runtime.getService<NaviService>(ServiceType.TRANSCRIPTION);

        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        const poolInfoSchema = z.object({
            token_symbol: z.string().optional().nullable(),
        });

        const poolInfoContext = composeContext({
            state,
            template: poolInfoTemplate,
        });

        const content = await generateObject({
            runtime,
            context: poolInfoContext,
            schema: poolInfoSchema,
            modelClass: ModelClass.SMALL,
        });

        const poolInfoContent = content.object as PoolInfoPayload;
        elizaLogger.info("Pool info content:", poolInfoContent);

        try {
            const poolInfo = await service.getPoolInfo(
                poolInfoContent.token_symbol
                    ? {
                          symbol: poolInfoContent.token_symbol.toUpperCase(),
                          address: "", // This will be filled by the SDK
                          decimal: 9,
                      }
                    : undefined
            );

            callback({
                text: `Here's the pool information: ${JSON.stringify(poolInfo, null, 2)}`,
                content: poolInfo,
            });

            return true;
        } catch (error) {
            elizaLogger.error("Error getting pool info:", error);
            callback({
                text: `Failed to get pool information: ${error}`,
                content: { error: "Failed to get pool information" },
            });
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me the SUI pool information in Navi",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you check the SUI pool information in Navi protocol...",
                    action: "GET_NAVI_POOL_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Here's the pool information for SUI: {...}",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What are all the available pools in Navi?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you check all available pools in Navi protocol...",
                    action: "GET_NAVI_POOL_INFO",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Here are all the available pools: {...}",
                },
            },
        ],
    ] as ActionExample[][],
} as Action; 