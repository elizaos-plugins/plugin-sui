import { NAVISDKClient } from "navi-sdk";
import type { NetworkType, CoinInfo } from "navi-sdk/dist/types";
import { elizaLogger, Service, ServiceType } from "@elizaos/core";

export class NaviService implements Service {
    private client: NAVISDKClient;
    private network: NetworkType;
    public serviceType = ServiceType.TRANSCRIPTION;

    constructor(network: NetworkType = "mainnet") {
        this.network = network;
    }

    async initialize(): Promise<void> {
        this.client = new NAVISDKClient({
            networkType: this.network,
            numberOfAccounts: 1
        });
    }

    public getNetwork(): NetworkType {
        return this.network;
    }

    public getAddress(): string {
        return this.client.accounts[0].getPublicKey();
    }

    public getAccount() {
        return this.client.accounts[0];
    }

    async getPoolInfo(coinType?: CoinInfo) {
        try {
            return await this.client.getPoolInfo(coinType);
        } catch (error) {
            elizaLogger.error("Error getting pool info:", error);
            throw error;
        }
    }

    async getReserveDetail(coinType: CoinInfo) {
        try {
            return await this.client.getReserveDetail(coinType);
        } catch (error) {
            elizaLogger.error("Error getting reserve detail:", error);
            throw error;
        }
    }

    async getHealthFactor(address: string) {
        try {
            return await this.client.getHealthFactor(address);
        } catch (error) {
            elizaLogger.error("Error getting health factor:", error);
            throw error;
        }
    }

    async getDynamicHealthFactor(
        address: string,
        coinType: CoinInfo,
        estimateSupply: number,
        estimateBorrow: number,
        isIncrease: boolean = true
    ) {
        try {
            return await this.client.getDynamicHealthFactor(
                address,
                coinType,
                estimateSupply,
                estimateBorrow,
                isIncrease
            );
        } catch (error) {
            elizaLogger.error("Error getting dynamic health factor:", error);
            throw error;
        }
    }

    async getAllNaviPortfolios() {
        try {
            return await this.client.getAllNaviPortfolios();
        } catch (error) {
            elizaLogger.error("Error getting all Navi portfolios:", error);
            throw error;
        }
    }

    async getAllBalances() {
        try {
            return await this.client.getAllBalances();
        } catch (error) {
            elizaLogger.error("Error getting all balances:", error);
            throw error;
        }
    }

    async getAvailableRewards(address?: string) {
        try {
            return await this.client.getAddressAvailableRewards(address);
        } catch (error) {
            elizaLogger.error("Error getting available rewards:", error);
            throw error;
        }
    }

    async getClaimedRewardsHistory(userAddress?: string, page: number = 1, size: number = 400) {
        try {
            return await this.client.getClaimedRewardsHistory(userAddress, page, size);
        } catch (error) {
            elizaLogger.error("Error getting claimed rewards history:", error);
            throw error;
        }
    }

    async executeOperation(operation: string, tokenSymbol: string, amount: string | number) {
        try {
            const tokenInfo = {
                symbol: tokenSymbol.toUpperCase(),
                address: "", // This will be filled by the SDK
                decimal: 9,
            };

            const account = this.client.accounts[0];
            const amountNum = Number(amount);

            switch (operation) {
                case "supply":
                    return await account.depositToNavi(tokenInfo, amountNum);
                case "withdraw":
                    return await account.withdraw(tokenInfo, amountNum);
                case "borrow":
                    return await account.borrow(tokenInfo, amountNum);
                case "repay":
                    return await account.repay(tokenInfo, amountNum);
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }
        } catch (error) {
            elizaLogger.error(`Error executing ${operation}:`, error);
            throw error;
        }
    }

    async swap(fromToken: string, toToken: string, amount: string | number) {
        try {
            const account = this.client.accounts[0];
            const amountNum = Number(amount);

            // Perform a dry run first to get the expected output
            const dryRunResult = await account.dryRunSwap(
                fromToken,
                toToken,
                amountNum,
                0 // We'll calculate minAmountOut from the dry run
            );

            // Set minAmountOut to 98% of the expected output (2% slippage)
            const minAmountOut = Math.floor(Number(dryRunResult.amount_out) * 0.98);

            // Execute the actual swap
            return await account.swap(
                fromToken,
                toToken,
                amountNum,
                minAmountOut
            );
        } catch (error) {
            elizaLogger.error("Error swapping tokens:", error);
            throw error;
        }
    }
} 