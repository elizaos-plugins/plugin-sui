import {
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  ModelClass,
  ServiceType,
  // ServiceType,
  State,
  composeContext,
  elizaLogger,
  generateObject,
  type Action,
} from "@elizaos/core";
import { SuiService } from "../services/sui";
import { z } from "zod";

export interface RemovePositionWithLiquidityPayload extends Content {
  position_id: string;
  amount: number;
  is_fixed_coin_a: boolean;
  slippage: number | null;
}

function isRemovePositionWithLiquidityContent(content: Content): content is RemovePositionWithLiquidityPayload {
  console.log("Content for remove position with liquidity", content);

  return (
    typeof content.position_id === "string" &&
    typeof content.amount === "number" &&
    typeof content.is_fixed_coin_a === "boolean" &&
    (content.slippage === null || typeof content.slippage === "number" || typeof content.slippage === "string")
  );
}

const removePositionWithLiquidityTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
Example response:
\`\`\`json
{
  "position_id": "0x305570e902a8a5cec306e99be01e6067f5475f9a557f0177e240b3e0c34c42cd",
  "is_fixed_coin_a": true,
  "amount": 1.17,
  "slippage": 0
}
\`\`\`

{{recentMessages}}

Based on our recent conversation, please provide the following information about the new position you want to open:
- Position id: The id of the position you want to remove.
- Is fixed coin A: Whether to fix coin A amount, true means coin A amount is fixed, false means coin B amount is fixed.
- Fixed coin amount: The amount of the fixed coin you want to contribute. If coin A is fixed, the amount is in coin A; if coin B is fixed, the amount is in coin B.
- Slippage tolerance: The maximum price deviation allowed when executing your position opening transaction (optional).

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "REMOVE_POSITION",
    similes: ["REMOVE_POSITION_WITH_LIQUIDITY"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating remove position with liquidity from user:", message.userId);
        return true;
    },
    description: "Remove a position with liquidity",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        const suiService = runtime.getService<SuiService>(
            ServiceType.TRANSCRIPTION
        );

        if (!state) {
            // Initialize or update state
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Define the schema for the expected output
        const removePositionWithLiquiditySchema = z.object({
            position_id: z.string(),
            is_fixed_coin_a: z.boolean(),
            amount: z.union([z.string(), z.number()]),
            slippage: z
                .union([z.string(), z.number()])
                .optional()
                .default(0.01),
        });

        // Compose open position with liquidity context
        const removePositionWithLiquidityContext = composeContext({
            state,
            template: removePositionWithLiquidityTemplate,
        });

        // Generate transfer content with the schema
        const content = await generateObject({
            runtime,
            context: removePositionWithLiquidityContext,
            schema: removePositionWithLiquiditySchema,
            modelClass: ModelClass.SMALL,
        });

        console.log("Generated content:", content);
        const removePositionWithLiquidityContent = content.object as RemovePositionWithLiquidityPayload;
        elizaLogger.info("Remove position with liquidity content:", removePositionWithLiquidityContent);

        if (suiService.getNetwork() == "mainnet") {
            // Validate open position with liquidity content
            if (!isRemovePositionWithLiquidityContent(removePositionWithLiquidityContent)) {
                console.error("Invalid content for REMOVE_POSITION_WITH_LIQUIDITY action.");
                if (callback) {
                    callback({
                        text: "Unable to process remove position with liquidity request. Invalid content provided.",
                        content: { error: "Invalid remove position with liquidity content" },
                    });
                }
                return false;
            }

            // one action only can call one callback to save new message.
            // runtime.processActions
            try {
                const result = await suiService.removePositionWithLiquidity({
                    positionId: removePositionWithLiquidityContent.position_id,
                    amount: removePositionWithLiquidityContent.amount,
                    isFixedCoinA: removePositionWithLiquidityContent.is_fixed_coin_a,
                    slippage: removePositionWithLiquidityContent.slippage,
                });

                if (result.success) {
                    callback({
                        text: `Successfully removed position ${
                            removePositionWithLiquidityContent.position_id
                        }, Transaction: ${suiService.getTransactionLink(
                            result.tx
                        )}`,
                        content: removePositionWithLiquidityContent,
                    });
                }
            } catch (error) {
                elizaLogger.error("Error remove position:", error);
                callback({
                    text: `Failed to remove position ${error}, removePositionWithLiquidityContent : ${JSON.stringify(
                        removePositionWithLiquidityContent
                    )}`,
                    content: { error: "Failed to remove position" },
                });
            }
        } else {
            callback({
                text:
                    "Sorry, I can only open position with liquidity on the mainnet, parsed params : " +
                    JSON.stringify(removePositionWithLiquidityContent, null, 2),
                content: { error: "Unsupported network" },
            });
            return false;
        }
        return true;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Open a new position with liquidity with SUI and USDC, pool fee rate is 0.01, fixed coin A, amount 100, lower price 0.9, upper price 1.1, slippage 0.01",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you open a new position with liquidity with SUI and USDC now...",
                    action: "OPEN_POSITION",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully opened position SUI/USDC with fee rate 0.01. Transaction: DKpeaAaUQdJ4Vo2S33qeFMyyjPm5Y5rb8VX8kMxw13sx",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to open a position with liquidity pool address 0x3b13ac70030d587624e407bbe791160b459c48f1049e04269eb8ee731f5442b4, fixed coin B, amount 500, lower price 0.4, upper price 0.6, slippage 0.01",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you open a new position with liquidity with CETUS and USDC now...",
                    action: "OPEN_POSITION",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully opened position CETUS/USDC with liquidity 200. Transaction: DKpeaAaUQdJ4Vo2S33qeFMyyjPm5Y5rb8VX8kMxw13sx",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
