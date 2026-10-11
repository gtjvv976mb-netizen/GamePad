// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGamePadStore {
    function publishGame(uint96 price, uint16 royaltyBps, string calldata uri) external returns (uint256);
    function withdraw() external;
}

/// @dev Test-only attacker: a studio whose receive() tries to re-enter withdraw().
///      swallow=false: the re-entry revert bubbles up, so the outer ETH transfer fails.
///      swallow=true:  the re-entry revert is caught, so we can check it never paid out twice.
contract ReentrantWithdrawer {
    IGamePadStore public immutable store;
    bool public swallow;
    bool public reentrySucceeded;
    uint256 public received;

    constructor(IGamePadStore store_) {
        store = store_;
    }

    function publish(uint96 price) external returns (uint256) {
        return store.publishGame(price, 0, "ipfs://attacker");
    }

    function setSwallow(bool s) external {
        swallow = s;
    }

    function attack() external {
        store.withdraw();
    }

    receive() external payable {
        received += msg.value;
        if (swallow) {
            try store.withdraw() {
                reentrySucceeded = true;
            } catch {}
        } else {
            store.withdraw();
        }
    }
}
