# @elizaos/plugin-sui

Core Sui blockchain plugin for Eliza OS that provides essential services and actions for token operations and wallet management.

## Overview

This plugin provides functionality to:

- Transfer SUI tokens between wallets
- Query wallet balances and portfolio values
- Track token prices and valuations
- Manage wallet interactions with the Sui network
- Swap any token pair by Cetus Aggregator on Sui network
- Create clmm pool and manager pool liquidity on Cetus DEX on Sui network

## Installation

```bash
npm install @elizaos/plugin-sui
```

## Configuration

The plugin requires the following environment variables:

```env
SUI_PRIVATE_KEY=your_private_key
SUI_NETWORK=mainnet|testnet|devnet|localnet
SUI_FULLNODE_URL=your_sui_fullnode_url
```

## Usage

Import and register the plugin in your Eliza configuration:

```typescript
import { suiPlugin } from "@elizaos/plugin-sui";

export default {
    plugins: [suiPlugin],
    // ... other configuration
};
```

## Features

### Send Token

Transfer SUI tokens to another address:

```typescript
// Example conversation
User: "Send 1 SUI to 0x4f2e63be8e7fe287836e29cde6f3d5cbc96eefd0c0e3f3747668faa2ae7324b0";
Assistant: "I'll send 1 SUI token now...";
```

### Check Wallet Balance

Query wallet balance and portfolio value:

```typescript
// Example conversation
User: "What's my wallet balance?";
Assistant: "Your wallet contains 10.5 SUI ($42.00 USD)...";
```

### Swap

Swap from token A to token B, and user can set min amount out check:

```typescript
// Example conversation
// 1. Did not pass the minimum output check.
User: 
    "Swap from 1 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH tO 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC, get min 5000 USDC.";
Assistant: "swapping 1 eth to at leasst 5000 USDC now!";
Assistant: "Failed to swap out amount is less than out_min_amount.";

// 2. Swap success
User: 
    "Swap from 1 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH tO 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC, get min 1880 USDC.";
Assistant: "swapping 1 eth to at least 1880 USDC now!";
Assistant: "Successfully swapped 1 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH to 0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC, Transaction: https://suivision.xyz/txblock/xxxxxxxxxxx";
```

### Create CLMM pool on Cetus DEX

Create clmm pool on Cetus DEX, The two coin types and fee rate of the pool must be unique and cannot be created repeatedly:

```typescript
// Example conversation
User: 
    "Create one 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH and USDC pool, fee rate is 0.0025";
Assistant: "Create 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH and USDC pool now...done!";
Assistant: "Successfully create 0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH and USDC pool, Transaction: https://suivision.xyz/txblock/xxxxxxxxxxx";
```

### Open position with liquidity on Cetus DEX

Open position and add liquidity on Cetus DEX. User need to manually select the price range to add and ensure that your wallet has sufficient liquidity.

```typescript
// Example conversation
User: 
    "open one position in pool 0xYC..., lower price equals 3.26, upper price equals 8.8, fix coinA, amount equals 99";
Assistant: "locking in your position on the pool with all the details set!";
Assistant: "Successfully opened position ETH and USDC with fee rate 0.01, Transaction: https://suivision.xyz/txblock/xxxxxxxxxxx";
```

### Remove liquidity

Remove liquidity by fix coin amount in specific position:

```typescript
// Example conversation
User: 
    "remove liquidity from one position 0xYC..., fix coin a, remove amount 1000, slippage equals 0.05";
Assistant: "removing 1,000 units from your position now!";
Assistant: "Successfully removed position 0xYC..., Transaction: https://suivision.xyz/txblock/xxxxxxxxxxx";
```


## API Reference

### Actions

- `SEND_TOKEN`: Transfer SUI tokens to another address
- `TRANSFER_TOKEN`: Alias for SEND_TOKEN
- `SEND_SUI`: Alias for SEND_TOKEN
- `PAY`: Alias for SEND_TOKEN
- `SWAP`: Swap from token A to token B
- `CREATE_POOL`: Create any token pair pool on Cetus DEX
- `OPEN_POSITION`: Open one position with liquidity on specific pool on Cetus DEX
- `OPEN_POSITION_WITH_LIQUIDITY`: Alias for OPEN_POSITION on Cetus DEX
- `REMOVE_LIQUIDITY`: Remove liquidity from specific position on Cetus DEX

### Providers

- `walletProvider`: Manages wallet interactions with the Sui network, including balance queries and portfolio tracking

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
```

## Dependencies

- `@mysten/sui`: Core Sui blockchain interaction library
- `bignumber.js`: Precise number handling
- `node-cache`: Caching implementation
- `@cetusprotocol/aggregator-sdk`: Core Cetus aggregator swap library
- `@cetusprotocol/cetus-sui-clmm-sdk`: Core Cetus DEX library
- Other standard dependencies listed in package.json

## Future Enhancements

The following features and improvements are planned for future releases:

1. **Transaction Management**

    - Batch transaction processing
    - Transaction simulation
    - Gas optimization strategies
    - Custom transaction builders
    - Advanced error handling

2. **Wallet Integration**

    - Multi-wallet support
    - Hardware wallet integration
    - Social recovery options
    - Account abstraction
    - Transaction history tracking

3. **Smart Contract Features**

    - Contract deployment tools
    - Move module templates
    - Testing framework
    - Upgrade management
    - Security analysis

4. **Token Operations**

    - Batch token transfers
    - NFT support enhancement
    - Token metadata handling
    - Custom token standards
    - Collection management

5. **Developer Tools**
    - Enhanced debugging
    - CLI improvements
    - Documentation generator
    - Integration templates
    - Performance monitoring

We welcome community feedback and contributions to help prioritize these enhancements.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

## Credits

This plugin integrates with and builds upon several key technologies:

- [Sui Blockchain](https://sui.io/): Next-generation smart contract platform
- [@mysten/sui.js](https://www.npmjs.com/package/@mysten/sui.js): Official Sui SDK
- [bignumber.js](https://github.com/MikeMcl/bignumber.js/): Precise number handling
- [node-cache](https://www.npmjs.com/package/node-cache): Caching implementation
- [Cetus](https://www.cetus.zone/): Cetus aims to simplify trading for all users and assets
- [@cetusprotocol/aggregator-sdk](https://www.npmjs.com/package/@cetusprotocol/aggregator-sdk): Official Cetus aggregator swap SDK
- [@cetusprotocol/cetus-sui-clmm-sdk](https://www.npmjs.com/package/@cetusprotocol/cetus-sui-clmm-sdk): Official Cetus DEX SDK

Special thanks to:

- The Mysten Labs team for developing Sui
- The Sui Developer community
- The Sui SDK maintainers
- The Eliza community for their contributions and feedback
- The Cetus team and SDK maintainers

For more information about Sui blockchain capabilities:

- [Sui Documentation](https://docs.sui.io/)
- [Sui Developer Portal](https://sui.io/developers)
- [Sui Network Dashboard](https://suiscan.xyz/)
- [Sui GitHub Repository](https://github.com/MystenLabs/sui)
- [Cetus Developer Portal](https://cetus-1.gitbook.io/cetus-developer-docs)
- [Cetus GitHub Repository](https://github.com/CetusProtocol)
## License

This plugin is part of the Eliza project. See the main project repository for license information.
