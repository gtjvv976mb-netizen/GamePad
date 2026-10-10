// Hardhat is used ONLY as an in-process EVM (EDR) for tests; compilation is done
// by scripts/build.mjs with solc-js so nothing needs to be downloaded.
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    hardhat: { hardfork: "cancun", chainId: 31337 },
  },
};
