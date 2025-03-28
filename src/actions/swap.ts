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

export interface SwapPayload extends Content {
    from_token: string;
    destination_token: string;
    amount: number;
    slippage: number | null;
    min_amount_out: number | null;
}

function isSwapContent(content: Content): content is SwapPayload {
    console.log("Content for transfer", content);
    return (
        typeof content.from_token === "string" &&
        typeof content.destination_token === "string" &&
        typeof content.amount === "number" &&
        (typeof content.slippage === "number" || content.slippage === null) &&
        (typeof content.min_amount_out === "number" || content.min_amount_out === null)
    );
}

const swapTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "from_token": "sui",
    "destination_token": "usdc",
    "amount": 1,
    "min_amount_out": 0.99,
    "slippage": 0.01
}
\`\`\`
or
\`\`\`json
{
    "from_token": "0x2::sui::SUI",
    "destination_token": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    "amount": 1,
    "min_amount_out": 0.99,
    "slippage": 0.01
}
\`\`\`


{{recentMessages}}

Given the recent messages, extract the following information about the requested token swap:
- Source Token you want to swap from, use symbol or address
- Destination token you want to swap to, use symbol or address
- Source Token Amount to swap
- Slippage percentage to swap

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "SWAP_TOKEN",
    similes: ["SWAP_TOKENS"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating sui transfer from user:", message.userId);
        return true;
    },
    description: "Swap from any token in the agent's wallet to another token",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting SWAP_TOKEN handler...");

        const service = runtime.getService<SuiService>(
            ServiceType.TRANSCRIPTION
        );

        if (!state) {
            // Initialize or update state
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Define the schema for the expected output
        const swapSchema = z.object({
            from_token: z.string(),
            destination_token: z.string(),
            amount: z.number(),
            min_amount_out: z.number().nullable().default(0),
            slippage: z
                .number()
                .nullable()
                .default(0.01),
        });

        // Compose transfer context
        const swapContext = composeContext({
            state,
            template: swapTemplate,
        });

        // Generate transfer content with the schema
        const content = await generateObject({
            runtime,
            context: swapContext,
            schema: swapSchema,
            modelClass: ModelClass.SMALL,
        });

        console.log("Generated content:", content);
        const swapContent = content.object as SwapPayload;
        elizaLogger.info("Swap content:", swapContent);

        if (service.getNetwork() == "mainnet") {
            // Validate transfer content
            if (!isSwapContent(swapContent)) {
                console.error("Invalid content for SWAP_TOKEN action.");
                if (callback) {
                    callback({
                        text: "Unable to process swap request. Invalid content provided.",
                        content: { error: "Invalid swap content" },
                    });
                }
                return false;
            }

            const destinationToken = await service.getTokenMetadata(
                swapContent.destination_token
            );
            elizaLogger.log("Destination token:", destinationToken);

            const fromToken = await service.getTokenMetadata(
                swapContent.from_token
            );
            elizaLogger.log("From token:", fromToken);

            // one action only can call one callback to save new message.
            // runtime.processActions
            if (destinationToken && fromToken) {
                try {
                    const swapAmount = service.getAmount(
                        swapContent.amount,
                        fromToken
                    );

                    elizaLogger.info("Swap amount:", swapAmount.toString());

                    const minAmountOut = service.getAmount(
                        swapContent.min_amount_out,
                        destinationToken
                    );
                    elizaLogger.info("Min amount out:", minAmountOut.toString());

                    elizaLogger.info(
                        "Destination token address:",
                        destinationToken.tokenAddress
                    );

                    elizaLogger.info(
                        "From token address:",
                        fromToken.tokenAddress
                    );

                    elizaLogger.info("Swap amount:", swapAmount);

                    const result = await service.swapToken(
                        fromToken.symbol,
                        swapAmount.toString(),
                        swapContent.slippage,
                        destinationToken.symbol,
                        Number(minAmountOut.toString())
                    );

                    if (result.success) {
                        callback({
                            text: `Successfully swapped ${swapContent.amount} ${
                                swapContent.from_token
                            } to  ${
                                swapContent.destination_token
                            }, Transaction: ${service.getTransactionLink(
                                result.tx
                            )}`,
                            content: swapContent,
                        });
                    } else {
                        callback({
                            text: `Failed to swap ${result.message}`,
                            content: swapContent,
                        });
                    }
                } catch (error) {
                    elizaLogger.error("Error swapping token:", error);
                    callback({
                        text: `Failed to swap ${error}, swapContent : ${JSON.stringify(
                            swapContent
                        )}`,
                        content: { error: "Failed to swap token" },
                    });
                }
            } else {
                callback({
                    text: `destination token: ${swapContent.destination_token} or from token: ${swapContent.from_token} not found`,
                    content: { error: "Destination token not found" },
                });
            }
        } else {
            callback({
                text:
                    "Sorry, I can only swap on the mainnet, parsed params : " +
                    JSON.stringify(swapContent, null, 2),
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
                    text: "Swap 1 SUI to USDC, slippage 0.01",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 SUI to USDC now...",
                    action: "SWAP_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully swapped 1 SUI to USDC, Transaction: 0x39a8c432d9bdad993a33cc1faf2e9b58fb7dd940c0425f1d6db3997e4b4b05c0",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Swap 1 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC to SUI, slippage 0.01",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 USDC to SUI now...",
                    action: "SWAP_TOKEN",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully swapped 1 USDC to SUI, Transaction: 0x39a8c432d9bdad993a33cc1faf2e9b58fb7dd940c0425f1d6db3997e4b4b05c0",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
