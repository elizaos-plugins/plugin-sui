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

export interface OpenPositionWithLiquidityPayload extends Content {
  lower_price: number;
  upper_price: number;
  is_fixed_coin_a: boolean;
  amount: number;
  pool_address: string | null;
  coin_type_a: string | null;
  coin_type_b: string | null;
  fee_rate: number | null;
  slippage: number | null;
}

function isOpenPositionWithLiquidityContent(content: Content): content is OpenPositionWithLiquidityPayload {
  console.log("Content for open position with liquidity", content);

  const feeRates = [0.02, 0.01, 0.0025, 0.001, 0.0005, 0.0001];
  if (
      typeof content.fee_rate === "number" &&
      !feeRates.includes(content.fee_rate)
  ) {
      elizaLogger.error("Invalid fee rate:", content.fee_rate);
      return false;
  }

  return (
    typeof content.lower_price === "number" &&
    typeof content.upper_price === "number" &&
    typeof content.is_fixed_coin_a === "boolean" &&
    typeof content.amount === "number" &&
    (content.coin_type_a === null || typeof content.coin_type_a === "string") &&
    (content.coin_type_b === null || typeof content.coin_type_b === "string") &&
    (content.pool_address === null || typeof content.pool_address === "string") &&
    (content.fee_rate === null || typeof content.fee_rate === "number" || typeof content.fee_rate === "string") &&
    (content.slippage === null || typeof content.slippage === "number" || typeof content.slippage === "string")
  );
}

const openPositionWithLiquidityTemplate = `Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined.
Example response:
\`\`\`json
{
  "coin_type_a": "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  "coin_type_b": "0x2::sui::SUI",
  "fee_rate": 0.01,
  "is_fixed_coin_a": true,
  "amount": 1.17,
  "slippage": 0,
  "lower_price": 0.00000035,
  "upper_price": 0.00000045
}
\`\`\`
or
\`\`\`json
{
  "pool_address": "0x9a0b1ac3f1346efaefb66c07fe1ffb8d2c76a1d527ea75be8e6f817619c0a6f5",
  "is_fixed_coin_a": true,
  "amount": 1.17,
  "slippage": 0.1,
  "lower_price": 0.000000035,
  "upper_price": 0.045
}
\`\`\`

{{recentMessages}}

Based on our recent conversation, please provide the following information about the new position you want to open:
- Lower price boundary: The minimum price threshold you wish to set for your new position.
- Upper price boundary: The maximum price threshold you wish to set for your new position (must be greater than the lower price).
- Fixed coin selection: Whether to fix coin A amount, true means coin A amount is fixed, false means coin B amount is fixed.
- Fixed coin amount: The amount of the fixed coin you want to contribute. If coin A is fixed, the amount is in coin A; if coin B is fixed, the amount is in coin B.
- Target liquidity pool address: The address of the liquidity pool where you want to open your new position (optional).
- Coin A type: The type of coin A for your new position (optional).
- Coin B type: The type of coin B for your new position (optional).
- Fee rate: The transaction fee rate for your new position, must be one of: [0.02, 0.01, 0.0025, 0.001, 0.0005, 0.0001] (optional).
- Slippage tolerance: The maximum price deviation allowed when executing your position opening transaction (optional).

Respond with a JSON markdown block containing only the extracted values.`;

export default {
  name: "OPEN_POSITION",
  similes: ["OPEN_POSITION_WITH_LIQUIDITY"],
  validate: async (runtime: IAgentRuntime, message: Memory) => {
      console.log("Validating open position with liquidity from user:", message.userId);
      return true;
  },
  description: "Open a new position with liquidity",
  handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      _options: { [key: string]: unknown },
      callback?: HandlerCallback
  ): Promise<boolean> => {
      elizaLogger.log("Starting OPEN_POSITION handler...");

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
      const openPositionWithLiquiditySchema = z.object({
          coin_type_a: z.string().nullable(),
          coin_type_b: z.string().nullable(),
          fee_rate: z.union([z.string(), z.number()]).nullable(),
          pool_address: z.string().nullable(),
          is_fixed_coin_a: z.boolean(),
          amount: z.union([z.string(), z.number()]),
          lower_price: z.union([z.string(), z.number()]),
          upper_price: z.union([z.string(), z.number()]),
          slippage: z
            .union([z.string(), z.number()])
            .optional()
            .default(0.01),
      });

      // Compose open position with liquidity context
      const openPositionWithLiquidityContext = composeContext({
          state,
          template: openPositionWithLiquidityTemplate,
      });

      // Generate transfer content with the schema
      const content = await generateObject({
          runtime,
          context: openPositionWithLiquidityContext,
          schema: openPositionWithLiquiditySchema,
          modelClass: ModelClass.SMALL,
      });

      console.log("Generated content:", content);
      const openPositionWithLiquidityContent = content.object as OpenPositionWithLiquidityPayload;
      elizaLogger.info("Open position with liquidity content:", openPositionWithLiquidityContent);

      if (suiService.getNetwork() == "mainnet") {
          // Validate open position with liquidity content
          if (!isOpenPositionWithLiquidityContent(openPositionWithLiquidityContent)) {
              console.error("Invalid content for OPEN_POSITION_WITH_LIQUIDITY action.");
              if (callback) {
                  callback({
                      text: "Unable to process open position with liquidity request. Invalid content provided.",
                      content: { error: "Invalid open position with liquidity content" },
                  });
              }
              return false;
          }


          let coinAToken, coinBToken, poolAddress;
          if (openPositionWithLiquidityContent.pool_address) {
            const pool = await suiService.getPool(
                openPositionWithLiquidityContent.pool_address
            );
            elizaLogger.info("get pool success:", pool);
            coinAToken = await suiService.getTokenMetadata(
                pool.coinTypeA
            );
            coinBToken = await suiService.getTokenMetadata(
                pool.coinTypeB
            );
            poolAddress = pool.poolAddress;
          } else {
            coinAToken = await suiService.getTokenMetadata(
                openPositionWithLiquidityContent.coin_type_a
            );
            coinBToken = await suiService.getTokenMetadata(
                openPositionWithLiquidityContent.coin_type_b
            );
          }
          // one action only can call one callback to save new message.
          // runtime.processActions
          if (coinAToken && coinBToken) {
              try {
                  const fixedAmount = suiService.getAmount(
                    openPositionWithLiquidityContent.amount,
                    openPositionWithLiquidityContent.is_fixed_coin_a
                          ? coinAToken
                          : coinBToken
                  );

                  elizaLogger.info("Fixed amount:", fixedAmount.toString());
                  elizaLogger.info(
                      "Is fixed coin a:",
                      openPositionWithLiquidityContent.is_fixed_coin_a.toString()
                  );

                  const result = await suiService.openPositionWithLiquidity({
                      coinTypeA: coinAToken.tokenAddress,
                      coinTypeB: coinBToken.tokenAddress,
                      poolAddress: openPositionWithLiquidityContent.pool_address,
                      feeRate: openPositionWithLiquidityContent.fee_rate,
                      isFixedCoinA: openPositionWithLiquidityContent.is_fixed_coin_a,
                      amount: Number(fixedAmount.toString()),
                      lowerPrice: openPositionWithLiquidityContent.lower_price,
                      upperPrice: openPositionWithLiquidityContent.upper_price,
                      slippage: openPositionWithLiquidityContent.slippage,
                  });

                  if (result.success) {
                      callback({
                          text: `Successfully opened position ${
                              openPositionWithLiquidityContent.coin_type_a
                          } and ${
                              openPositionWithLiquidityContent.coin_type_b
                          } with fee rate ${
                              openPositionWithLiquidityContent.fee_rate
                          }, Transaction: ${suiService.getTransactionLink(
                              result.tx
                          )}`,
                          content: openPositionWithLiquidityContent,
                      });
                  }
              } catch (error) {
                  elizaLogger.error("Error open position:", error);
                  callback({
                      text: `Failed to open position ${error}, openPositionWithLiquidityContent : ${JSON.stringify(
                          openPositionWithLiquidityContent
                      )}`,
                      content: { error: "Failed to open position" },
                  });
              }
          } else {
              callback({
                  text: `coin a: ${openPositionWithLiquidityContent.coin_type_a} or coin b: ${openPositionWithLiquidityContent.coin_type_b} not found`,
                  content: { error: "Coin a or coin b not found" },
              });
          }
      } else {
          callback({
              text:
                  "Sorry, I can only open position with liquidity on the mainnet, parsed params : " +
                  JSON.stringify(openPositionWithLiquidityContent, null, 2),
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
