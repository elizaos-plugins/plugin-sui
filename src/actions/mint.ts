import type {
    Action,
    Content,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
} from "@elizaos/core";
import { walletProvider } from "../providers/wallet";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { parseAccount, SuiNetwork } from "../utils";
import { generateObject, ModelClass } from "@elizaos/core";
import { z } from "zod";

export interface MintNFTPayload extends Content {
    name: string;
    description: string;
    url: string;
}

// Define NFT parameter extraction template
const mintTemplate = `Extract NFT information from the following message:

{{text}}

Return a JSON object with:
- name: NFT name
- description: NFT content or description
- url: NFT URL

Example:
\`\`\`json
{
    "name": "Spring Poem",
    "description": "A beautiful poem about spring",
    "url": "ipfs://QmXXX..."
}
\`\`\`

Return ONLY the JSON object.`;

// Define NFT parameter schema using zod
const mintSchema = z.object({
    name: z.string(),
    description: z.string(),
    url: z.string()
});

const mintNFT: Action = {
    name: "mint",
    description: "Mint NFT on Sui blockchain",
    similes: ["MINT_NFT", "CREATE_NFT", "GENERATE_NFT", "ISSUE_NFT"],

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        const packageId = runtime.getSetting("NFT_PACKAGE_ID");
        const module = runtime.getSetting("NFT_MODULE");
        return !!(packageId && module);
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        try {
            console.log("[SUI] Starting NFT mint...");
            const walletInfo = await walletProvider.get(runtime, message, state);
            state.walletInfo = walletInfo;

            // Directly construct context string
            const context = mintTemplate.replace(
                "{{text}}", 
                message.content.text || ""
            );

            console.log("[SUI] Generated context:", context);

            const content = await generateObject({
                runtime,
                context,
                schema: mintSchema,
                modelClass: ModelClass.SMALL,
            });

            console.log("[SUI] Extracted content:", content);

            console.log("Generated content:", content);
            const mintContent = content.object as MintNFTPayload;
            console.log("Mint content:", mintContent);

            // Validate required parameters
            if (!mintContent.name || !mintContent.description || !mintContent.url) {
                throw new Error(
                    "Missing required parameters: name, description, or url"
                );
            }

            // Get contract configuration
            const packageId = runtime.getSetting("NFT_PACKAGE_ID");
            const module = runtime.getSetting("NFT_MODULE");

            const suiAccount = parseAccount(runtime);
            const network = runtime.getSetting("SUI_NETWORK");
            const suiClient = new SuiClient({
                url: getFullnodeUrl(network as SuiNetwork),
            });

            const tx = new Transaction();
            //ref https://github.com/MystenLabs/sui/blob/main/examples/move/nft/sources/testnet_nft.move
            tx.moveCall({
                target: `${packageId}::${module}::mint_to_sender`,
                arguments: [tx.pure.string(mintContent.name), tx.pure.string(mintContent.description), tx.pure.string(mintContent.url)],
            });

            const result = await suiClient.signAndExecuteTransaction({
                signer: suiAccount,
                transaction: tx,
            });

            if (callback) {
                callback({
                    text: "Successfully minted NFT",
                    content: result,
                });
            }
            return true;

        } catch (error) {
            console.error("[SUI] Mint error:", error);
            if (callback) {
                callback({
                    text: `Failed to mint NFT: ${(error as Error).message}`,
                    error: error,
                });
            }
            return false;
        }
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create an nft named: Sleep, content: The melodious song lingers in the air, and the soul resonates with boundless joy. The melody is like the gurgling of water, warming the heart and entering the dream field, url: ipfs://QmXXX..x.mp3",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll mint your poem as an NFT on Sui blockchain.",
                    action: "mint",
                },
            },
        ],
    ],
};

export default mintNFT;
