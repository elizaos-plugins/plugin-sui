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

export interface CreatePoolPayload extends Content {
    coin_type_a: string;
    coin_type_b: string;
    fee_rate: number;
    initial_price: number;
    is_fixed_coin_a: boolean;
    amount: number;
    lower_price: number;
    upper_price: number;
    url: string | null;
}

function isCreatePoolContent(content: Content): content is CreatePoolPayload {
    console.log("Content for create pool", content);

    const feeRates = [0.02, 0.01, 0.0025, 0.001, 0.0005, 0.0001];
    if (
        typeof content.fee_rate === "number" &&
        !feeRates.includes(content.fee_rate)
    ) {
        elizaLogger.error("Invalid fee rate:", content.fee_rate);
        return false;
    }

    return (
        typeof content.coin_type_a === "string" &&
        typeof content.coin_type_b === "string" &&
        typeof content.initial_price === "number" &&
        typeof content.lower_price === "number" &&
        typeof content.upper_price === "number" &&
        typeof content.is_fixed_coin_a === "boolean" &&
        typeof content.amount === "number" &&
        (typeof content.url === "string" || content.url === null)
    );
}

const createPoolTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.

Example response:
\`\`\`json
{
    "coin_type_a": "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
    "coin_type_b": "0x2::sui::SUI",
    "fee_rate": 0.01,
    "initial_price": 1,
    "is_fixed_coin_a": true,
    "amount": 1.1,
    "lower_price": 0.9,
    "upper_price": 1.1,
    "url": "https://example.com" || null
}

{{recentMessages}}

Given the recent messages, extract the following information about the requested token swap:
- One coin of new pool you want to create, use symbol or address
- Another coin of new pool you want to create, use symbol or address
- Fee rate of new pool you want to create, must be one of [0.02, 0.01, 0.0025, 0.001, 0.0005, 0.0001]
- Initial price of new pool you want to create
- Is fixed coin a of new pool you want to create, true means coin a amount is fixed, false means coin b amount is fixed
- Amount of new pool you want to create
- Lower price of new pool you want to create, must be less than initial price
- Upper price of new pool you want to create, must be greater than initial price
- Url of new pool you want to create, optional

Respond with a JSON markdown block containing only the extracted values.`;

export default {
    name: "CREATE_POOL",
    similes: ["CREATE_CETUS_POOL", "NEW_CLMM_POOL"],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        console.log("Validating create pool from user:", message.userId);
        return true;
    },
    description: "Create a new CLMM pool",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("Starting CREATE_POOL handler...");

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
        const createPoolSchema = z.object({
            coin_type_a: z.string(),
            coin_type_b: z.string(),
            fee_rate: z.number(),
            initial_price: z.number(),
            is_fixed_coin_a: z.boolean(),
            amount: z.number(),
            lower_price: z.number(),
            upper_price: z.number(),
            url: z.string().nullable(),
        });

        // Compose transfer context
        const createPoolContext = composeContext({
            state,
            template: createPoolTemplate,
        });

        // Generate transfer content with the schema
        const content = await generateObject({
            runtime,
            context: createPoolContext,
            schema: createPoolSchema,
            modelClass: ModelClass.SMALL,
        });

        console.log("Generated content:", content);
        const createPoolContent = content.object as CreatePoolPayload;
        elizaLogger.info("Create pool content:", createPoolContent);

        if (suiService.getNetwork() == "mainnet") {
            // Validate transfer content
            if (!isCreatePoolContent(createPoolContent)) {
                console.error("Invalid content for CREATE_POOL action.");
                if (callback) {
                    callback({
                        text: "Unable to process swap request. Invalid content provided.",
                        content: { error: "Invalid swap content" },
                    });
                }
                return false;
            }

            const coinAToken = await suiService.getTokenMetadata(
                createPoolContent.coin_type_a
            );
            elizaLogger.info("Coin a token:", coinAToken);

            const coinBToken = await suiService.getTokenMetadata(
                createPoolContent.coin_type_b
            );
            elizaLogger.info("Coin b token:", coinBToken);

            // one action only can call one callback to save new message.
            // runtime.processActions
            if (coinAToken && coinBToken) {
                try {
                    const fixedAmount = suiService.getAmount(
                        createPoolContent.amount,
                        createPoolContent.is_fixed_coin_a
                            ? coinAToken
                            : coinBToken
                    );
                    elizaLogger.info("Fixed amount:", fixedAmount.toString());
                    elizaLogger.info(
                        "Coin a address:",
                        coinAToken.tokenAddress
                    );
                    elizaLogger.info(
                        "Coin b address:",
                        coinBToken.tokenAddress
                    );
                    elizaLogger.info(
                        "Is fixed coin a:",
                        createPoolContent.is_fixed_coin_a.toString()
                    );

                    const result = await suiService.createPool({
                        coinTypeA: coinAToken.tokenAddress,
                        coinTypeB: coinBToken.tokenAddress,
                        feeRate: createPoolContent.fee_rate,
                        initialPrice: createPoolContent.initial_price,
                        isFixedCoinA: createPoolContent.is_fixed_coin_a,
                        amount: createPoolContent.amount,
                        lowerPrice: createPoolContent.lower_price,
                        upperPrice: createPoolContent.upper_price,
                        url: createPoolContent.url,
                    });

                    if (result.success) {
                        callback({
                            text: `Successfully created pool ${
                                createPoolContent.coin_type_a
                            } and ${
                                createPoolContent.coin_type_b
                            } with fee rate ${
                                createPoolContent.fee_rate
                            }, Transaction: ${suiService.getTransactionLink(
                                result.tx
                            )}`,
                            content: createPoolContent,
                        });
                    } else {
                        callback({
                            text: `Failed to create pool: ${result.message}.\n createPoolContent : ${JSON.stringify(
                                createPoolContent
                            )}`,
                        });
                    }
                } catch (error) {
                    elizaLogger.error("Error create pool:", error);
                    callback({
                        text: `Failed to create pool ${error}, createPoolContent : ${JSON.stringify(
                            createPoolContent
                        )}`,
                        content: { error: "Failed to create pool" },
                    });
                }
            } else {
                callback({
                    text: `coin a: ${createPoolContent.coin_type_a} or coin b: ${createPoolContent.coin_type_b} not found`,
                    content: { error: "Coin a or coin b not found" },
                });
            }
        } else {
            callback({
                text:
                    "Sorry, I can only create pool on the mainnet, parsed params : " +
                    JSON.stringify(createPoolContent, null, 2),
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
                    text: "Create a new CLMM pool with SUI and USDC, fee rate 0.01, initial price 1, fixed coin A, amount 100, lower price 0.9, upper price 1.1",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you create a new Cetus pool with SUI and USDC now...",
                    action: "CREATE_POOL",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully created pool SUI/USDC with fee rate 0.01. Transaction: 0x39a8c432d9bdad993a33cc1faf2e9b58fb7dd940c0425f1d6db3997e4b4b05c0",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "I want to create a pool for CETUS and USDT with an initial price of 0.5, fixed coin B, amount 500, lower price 0.4, upper price 0.6",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Please confirm the fee rate for the new pool.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "The fee rate for the new pool is 0.0025.",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you create a new CLMM pool with CETUS and USDT now...",
                    action: "CREATE_POOL",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Successfully created pool CETUS/USDT with fee rate 0.0025. Transaction: 0x29b7c123d8bd9a993b23dd2faf2e9b58fb7dd940c0425f1d6db3997e4b4b06d3",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
