import {
    elizaLogger,
    IAgentRuntime,
    Service,
    ServiceType,
} from "@elizaos/core";
import { SuiClient } from "@mysten/sui/client";
import { parseAccount, parseFullNodeUrl, SuiNetwork } from "../utils";
import { AggregatorClient, Env, isSortedSymbols } from "@cetusprotocol/aggregator-sdk";
import BN from "bn.js";
import { TokenMetadata, TokensManager } from "../tokens";
import { Signer } from "@mysten/sui/cryptography";
import {
    Transaction,
    TransactionObjectArgument,
} from "@mysten/sui/transactions";
import CetusClmmSDK, { adjustForCoinSlippage, ClmmPoolUtil, d, initCetusSDK, Percentage, Pool, TickMath } from "@cetusprotocol/cetus-sui-clmm-sdk"
import { normalizeSuiAddress } from "@mysten/sui/utils"

const aggregatorURL = "https://api-sui.cetus.zone/router_v2/find_routes";

interface SwapResult {
    success: boolean;
    tx: string;
    message: string;
}
 
interface CreatePoolWithFixedCoinParams {
    coinTypeA: string;
    coinTypeB: string;
    feeRate: number;
    initialPrice: number;
    lowerPrice: number;
    upperPrice: number;
    isFixedCoinA: boolean; // if true, coinA is the fixed amount coin, otherwise coinB is the fixed coin
    amount: number;
    url?: string;
}

interface CreatePoolResult {
    success: boolean;
    tx: string;
    message: string;
}

interface OpenPositionWithLiquidityResult {
  success: boolean;
  tx: string;
  message: string;
}

interface OpenPositionWithLiquidityParams {
  lowerPrice: number;
  upperPrice: number;
  isFixedCoinA: boolean; // if true, coinA is the fixed amount coin, otherwise coinB is the fixed coin
  amount: number;
  coinTypeA?: string;
  coinTypeB?: string;
  feeRate?: number;
  poolAddress?: string;
  slippage?: number;
}

interface RemovePositionWithLiquidityParams {
  positionId: string;
  amount: number;
  isFixedCoinA: boolean; // if true, coinA is the fixed amount coin, otherwise coinB is the fixed coin
  slippage?: number;
}

export class SuiService extends Service {
    static serviceType: ServiceType = ServiceType.TRANSCRIPTION;
    private suiClient: SuiClient;
    private network: SuiNetwork;
    private wallet: Signer;
    private tokensManager: TokensManager;
    private aggClient: AggregatorClient;
    private clmmSDK: CetusClmmSDK;

    initialize(runtime: IAgentRuntime): Promise<void> {
        this.wallet = parseAccount(runtime);  
        const fullNodeUrl = parseFullNodeUrl(runtime);
        this.suiClient = new SuiClient({
            url: fullNodeUrl,
        });
        this.network = runtime.getSetting("SUI_NETWORK") as SuiNetwork;
        if (this.network !== "mainnet" && this.network !== "testnet") {
            throw new Error(
                `Cetus is not supported on ${this.network} network`
            );
        }
        this.tokensManager = new TokensManager(this.suiClient);
        this.aggClient = new AggregatorClient(
            aggregatorURL,
            this.wallet.toSuiAddress(),
            this.suiClient,
            Env.Mainnet
        );
        this.clmmSDK = initCetusSDK({
            network: this.network,
            fullNodeUrl,
            wallet: this.wallet.toSuiAddress(),
        });
        this.clmmSDK.senderAddress = this.wallet.toSuiAddress();
        return null;
    }

    async getTokenMetadata(token: string) {
        const meta = await this.tokensManager.getTokenMetadata(token);
        return meta;
    }

    getTickSpacing(feeRate: number): number | null {
        switch (feeRate) {
            case 0.02:
                return 220;
            case 0.01:
                return 200;
            case 0.0025:
                return 60;
            case 0.001:
                return 20;
            case 0.0005:
                return 10;
            case 0.0001:
                return 2;
            default:
                return null;
        }
    }

    getAddress() {
        return this.wallet.toSuiAddress();
    }

    getAmount(amount: string | number, meta: TokenMetadata) {
        return BigInt(Number(amount) * Math.pow(10, meta.decimals));
    }

    getNetwork() {
        return this.network;
    }

    getTransactionLink(tx: string) {
        if (this.network === "mainnet") {
            return `https://suivision.xyz/txblock/${tx}`;
        } else if (this.network === "testnet") {
            return `https://testnet.suivision.xyz/txblock/${tx}`;
        } else if (this.network === "devnet") {
            return `https://devnet.suivision.xyz/txblock/${tx}`;
        } else if (this.network === "localnet") {
            return `localhost : ${tx}`;
        }
    }

    async checkPoolExists(
        coinTypeA: string,
        coinTypeB: string,
        feeRate: number
    ): Promise<Pool[]> {
        elizaLogger.info("Checking pool exists:", coinTypeA, coinTypeB, feeRate);
        const pools = await this.clmmSDK.Pool.getPoolByCoins(
            [coinTypeA, coinTypeB],
            feeRate
        );
        elizaLogger.info("Pools:", pools);
        return pools;
    }

    async getPool(
        poolAddress: string
    ): Promise<Pool> {
        return await this.clmmSDK.Pool.getPool(poolAddress, true);
    }

    async createPool(
        params: CreatePoolWithFixedCoinParams
    ): Promise<CreatePoolResult> {
        let {
            coinTypeA,
            coinTypeB,
            feeRate,
            initialPrice,
            lowerPrice,
            upperPrice,
            isFixedCoinA,
            amount,
        } = params;

        const pools = await this.checkPoolExists(
            coinTypeA,
            coinTypeB,
            feeRate
        );

        if (pools.length === 1) {
            return { success: false, tx: "", message: `Pool: ${pools[0].poolAddress} already exists` };
        }

        // resort coinTypeA and coinTypeB
        if (
            isSortedSymbols(
                normalizeSuiAddress(params.coinTypeA),
                normalizeSuiAddress(params.coinTypeB)
            )
        ) {
            [coinTypeA, coinTypeB] = [coinTypeB, coinTypeA];
            [initialPrice, lowerPrice, upperPrice] = [
                1 / initialPrice,
                1 / upperPrice,
                1 / lowerPrice,
            ];
        }

        const coinAMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeA
        );
        const coinBMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeB
        );

        const initialSqrtPrice = TickMath.priceToSqrtPriceX64(
            d(initialPrice),
            coinAMetaData.decimals,
            coinBMetaData.decimals
        );
        const currentTickIndex =
            TickMath.sqrtPriceX64ToTickIndex(initialSqrtPrice);
        const tickSpacing = this.getTickSpacing(feeRate);
        if (!tickSpacing) {
            elizaLogger.error(
                `Invalid fee rate: ${feeRate}, must be one of 0.02, 0.01, 0.0025, 0.001, 0.0005, 0.0001`
            );
            return;
        }

        const lowerTick = TickMath.getPrevInitializableTickIndex(
            currentTickIndex,
            tickSpacing
        );
        const upperTick = TickMath.getNextInitializableTickIndex(
            currentTickIndex,
            tickSpacing
        );

        const liquidityInput =
            ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
                lowerTick,
                upperTick,
                new BN(amount),
                isFixedCoinA,
                true,
                0.1,
                initialSqrtPrice
            );

        const amountA = isFixedCoinA
            ? amount
            : liquidityInput.tokenMaxA.toNumber();
        const amountB = isFixedCoinA
            ? liquidityInput.tokenMaxB.toNumber()
            : amount;

        const txb = await this.clmmSDK.Pool.createPoolTransactionPayload({
            coinTypeA,
            coinTypeB,
            tick_spacing: tickSpacing,
            initialize_sqrt_price: initialSqrtPrice.toString(),
            uri: params.url || "",
            amount_a: amountA,
            amount_b: amountB,
            fix_amount_a: isFixedCoinA,
            tick_lower: lowerTick,
            tick_upper: upperTick,
            metadata_a: coinAMetaData.id,
            metadata_b: coinBMetaData.id,
            slippage: 0.1,
        });

        txb.setSender(this.wallet.toSuiAddress());
        const result = await this.suiClient.signAndExecuteTransaction({
            transaction: txb,
            signer: this.wallet,
        });

        return {
            success: true,
            tx: result.digest,
            message: "Create pool successful",
        };
    }

    async openPositionWithLiquidity(
      params: OpenPositionWithLiquidityParams
    ): Promise<OpenPositionWithLiquidityResult> {
        let {
            coinTypeA,
            coinTypeB,
            feeRate,
            lowerPrice,
            upperPrice,
            isFixedCoinA,
            amount,
            poolAddress,
            slippage,
        } = params;

        let pool: Pool = null;
        if (poolAddress == null) {
            const pools = await this.checkPoolExists(
              coinTypeA,
              coinTypeB,
              feeRate
          );
          if (pools.length !== 1) {
              return { success: false, tx: "", message: "Pool not found" };
          }
          pool = pools[0];
        } else {
          pool = await this.clmmSDK.Pool.getPool(poolAddress, true);
        }
        // resort coinTypeA and coinTypeB
        if (
            isSortedSymbols(
                normalizeSuiAddress(params.coinTypeA),
                normalizeSuiAddress(params.coinTypeB)
            )
        ) {
            [coinTypeA, coinTypeB, lowerPrice, upperPrice] = [coinTypeB, coinTypeA, 1 / upperPrice, 1 / lowerPrice];
        }

        const coinAMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeA
        );
        const coinBMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeB
        );
        const lowerTickIndex = TickMath.priceToTickIndex(
            d(lowerPrice),
            coinAMetaData.decimals,
            coinBMetaData.decimals
        );
        const upperTickIndex = TickMath.priceToTickIndex(
            d(upperPrice),
            coinAMetaData.decimals,
            coinBMetaData.decimals
        );
        const lowerTick = TickMath.getPrevInitializableTickIndex(
            lowerTickIndex,
            Number(pool.tickSpacing)
        );
        const upperTick = TickMath.getNextInitializableTickIndex(
            upperTickIndex,
            Number(pool.tickSpacing)
        );
        elizaLogger.info("Lower tick:", lowerTick.toString());
        elizaLogger.info("Upper tick:", upperTick.toString());

        const liquidityInput =
            ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
                lowerTick,
                upperTick,
                new BN(amount),
                isFixedCoinA,
                true,
                0.1,
                new BN(pool.current_sqrt_price)
            );

        const amountA = isFixedCoinA
            ? amount
            : liquidityInput.tokenMaxA.toNumber();
        elizaLogger.info("Amount A:", amountA.toString());
        const amountB = isFixedCoinA
            ? liquidityInput.tokenMaxB.toNumber()
            : amount;
        elizaLogger.info("Amount B:", amountB.toString());
        const addLiquidityParams = {
            coinTypeA,
            coinTypeB,
            amount_a: amountA,
            amount_b: amountB,
            fix_amount_a: isFixedCoinA,
            tick_lower: lowerTick.toString(),
            tick_upper: upperTick.toString(),
            slippage,
            pool_id: pool.poolAddress,
            is_open: true,
            rewarder_coin_types: [],
            collect_fee: false,
            pos_id: '',
        }
        elizaLogger.info("Add liquidity params:", addLiquidityParams);
        const txb = await this.clmmSDK.Position.createAddLiquidityFixTokenPayload(addLiquidityParams, {
            slippage: slippage,
            curSqrtPrice: new BN(pool.current_sqrt_price),
          });

        txb.setSender(this.wallet.toSuiAddress());
        const result = await this.suiClient.signAndExecuteTransaction({
            transaction: txb,
            signer: this.wallet,
        });

        return {
            success: true,
            tx: result.digest,
            message: "Open position with liquidity successful",
        };
    }

    async removePositionWithLiquidity(
        params: RemovePositionWithLiquidityParams
    ): Promise<OpenPositionWithLiquidityResult> {
        let {
            positionId,
            amount,
            isFixedCoinA,
            slippage,
        } = params;

        const position = await this.clmmSDK.Position.getPositionById(positionId);
        if (position == null) {
            return { success: false, tx: "", message: "Position not found" };
        }
        const pool = await this.clmmSDK.Pool.getPool(position.pool, true);
        const coinTypeA = pool.coinTypeA;
        const coinTypeB = pool.coinTypeB;

        const coinAMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeA
        );
        const coinBMetaData = await this.tokensManager.getTokenMetadata(
            coinTypeB
        );

        const fixedAmount = this.getAmount(
            amount,
            isFixedCoinA
                  ? coinAMetaData
                  : coinBMetaData
        );

        const liquidityInput = ClmmPoolUtil.estLiquidityAndcoinAmountFromOneAmounts(
            position.tick_lower_index,
            position.tick_upper_index,
            new BN(fixedAmount.toString()),
            isFixedCoinA,
            false,
            slippage,
            new BN(pool.current_sqrt_price)
        )
        const amount_a = isFixedCoinA ? fixedAmount.toString() : liquidityInput.tokenMaxA.toString()
        const amount_b = isFixedCoinA ? liquidityInput.tokenMaxB.toString() : fixedAmount.toString()
        const liquidity = liquidityInput.liquidityAmount.toString()

        const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage({ coinA: new BN(amount_a), coinB: new BN(amount_b) }, new Percentage(new BN(slippage*100), new BN(100)), false)

        const removeLiquidityParams = {
          coinTypeA: pool.coinTypeA,
          coinTypeB: pool.coinTypeB,
          delta_liquidity: liquidity,
          min_amount_a: tokenMaxA.toString(),
          min_amount_b: tokenMaxB.toString(),
          pool_id: pool.poolAddress,
          pos_id: position.pos_object_id,
          rewarder_coin_types: [],
          collect_fee: true,
        }
        elizaLogger.info("Remove liquidity params:", removeLiquidityParams);
        const txb = await this.clmmSDK.Position.removeLiquidityTransactionPayload(removeLiquidityParams)

        txb.setSender(this.wallet.toSuiAddress());
        const result = await this.suiClient.signAndExecuteTransaction({
            transaction: txb,
            signer: this.wallet,
        });

        return {
            success: true,
            tx: result.digest,
            message: "Remove position with liquidity successful",
        };
    }

    async swapToken(
        fromToken: string,
        amount: number | string,
        slippage: number,
        targetToken: string,
        minAmountOut: number
    ): Promise<SwapResult> {
        const fromMeta = await this.getTokenMetadata(fromToken);
        const toMeta = await this.getTokenMetadata(targetToken);
        elizaLogger.info("From token metadata:", fromMeta);
        elizaLogger.info("To token metadata:", toMeta);
        const client = new AggregatorClient(
            aggregatorURL,
            this.wallet.toSuiAddress(),
            this.suiClient,
            Env.Mainnet
        );
        // provider list : https://api-sui.cetus.zone/router_v2/status
        // default support all providers and depth 3
        const routerRes = await client.findRouters({
            from: fromMeta.tokenAddress,
            target: toMeta.tokenAddress,
            amount: new BN(amount),
            byAmountIn: true, // `true` means fix input amount, `false` means fix output amount
        });

        if (routerRes === null) {
            elizaLogger.error(
                "No router found" +
                    JSON.stringify({
                        from: fromMeta.tokenAddress,
                        target: toMeta.tokenAddress,
                        amount: amount,
                    })
            );
            return {
                success: false,
                tx: "",
                message: "No router found",
            };
        }

        if (routerRes.amountOut.toNumber() < minAmountOut) {
            return {
                success: false,
                tx: "",
                message: "Out amount is less than out_min_amount",
            };
        }


        let coin: TransactionObjectArgument;
        const routerTx = new Transaction();

        if (fromToken.toUpperCase() === "SUI") {
            coin = routerTx.splitCoins(routerTx.gas, [amount]);
        } else {
            const allCoins = await this.suiClient.getCoins({
                owner: this.wallet.toSuiAddress(),
                coinType: fromMeta.tokenAddress,
                limit: 30,
            });

            if (allCoins.data.length === 0) {
                elizaLogger.error("No coins found");
                return {
                    success: false,
                    tx: "",
                    message: "No coins found",
                };
            }

            const mergeCoins = [];

            for (let i = 1; i < allCoins.data.length; i++) {
                elizaLogger.info("Coin:", allCoins.data[i]);
                mergeCoins.push(allCoins.data[i].coinObjectId);
            }
            elizaLogger.info("Merge coins:", mergeCoins);

            routerTx.mergeCoins(allCoins.data[0].coinObjectId, mergeCoins);
            coin = routerTx.splitCoins(allCoins.data[0].coinObjectId, [amount]);
        }

        const targetCoin = await client.routerSwap({
            routers: routerRes!.routes,
            byAmountIn: true,
            txb: routerTx,
            inputCoin: coin,
            slippage: slippage,
        });

        routerTx.transferObjects([targetCoin], this.wallet.toSuiAddress());
        routerTx.setSender(this.wallet.toSuiAddress());
        const result = await client.signAndExecuteTransaction(
            routerTx,
            this.wallet
        );

        return {
            success: true,
            tx: result.digest,
            message: "Swap successful",
        };
    }
}

export function getTickSpacing(feeRate: number): number | null {
    switch (feeRate) {
        case 0.02:
            return 220;
        case 0.01:
            return 200;
        case 0.0025:
            return 60;
        case 0.001:
            return 20;
        case 0.0005:
            return 10;
        case 0.0001:
            return 2;
        default:
            return null;
    }
}
