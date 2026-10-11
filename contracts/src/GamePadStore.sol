// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GamePadStore
/// @notice Game store + resale market. Each ERC-1155 token id is a game; one token is one license (copy).
///         Studios publish games and earn on primary sales and a royalty on every resale through the
///         built-in market. Licenses stay freely transferable; ERC-2981 `royaltyInfo` lets other
///         marketplaces honor the same royalty.
/// @dev All payouts are pull payments: sales only credit `owed`, and accounts call `withdraw()`.
contract GamePadStore is ERC1155, IERC2981, Ownable, ReentrancyGuard {
    struct Game {
        address studio;
        uint96 price; // wei; 0 = free
        uint16 royaltyBps; // resale royalty to the studio, fixed at publish
        bool active; // primary sales open
        string uri;
    }

    // Field order is the order `listings(id)` returns: (seller, gameId, price, active).
    struct Listing {
        address seller;
        uint256 gameId;
        uint96 price;
        bool active;
    }

    uint16 public constant MAX_ROYALTY_BPS = 1500; // 15%
    uint16 public constant MAX_FEE_BPS = 1500; // 15%
    uint256 private constant BPS = 10_000;

    uint16 public feeBps = 1000; // platform fee, 10%
    address public treasury;
    uint256 public gameCount; // game ids are 1..gameCount
    uint256 public listingCount; // listing ids are 1..listingCount

    mapping(uint256 id => Game) public games;
    mapping(uint256 listingId => Listing) public listings;
    mapping(address account => uint256) public owed; // withdrawable wei

    event GamePublished(uint256 indexed id, address indexed studio, uint256 price, uint16 royaltyBps, string uri);
    event GameUpdated(uint256 indexed id, uint256 price, bool active);
    event Purchased(uint256 indexed id, address indexed buyer, uint256 price);
    event Listed(uint256 indexed listingId, uint256 indexed gameId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed listingId);
    event Sold(
        uint256 indexed listingId,
        uint256 indexed gameId,
        address seller,
        address indexed buyer,
        uint256 price,
        uint256 royalty,
        uint256 fee
    );
    event Withdrawn(address indexed account, uint256 amount);
    event FeeUpdated(uint16 bps);
    event TreasuryUpdated(address treasury);

    error RoyaltyTooHigh();
    error FeeTooHigh();
    error ZeroAddress();
    error NotStudio();
    error GameNotActive();
    error WrongValue(uint256 expected, uint256 sent);
    error NotSeller();
    error ListingNotActive();
    error NothingToWithdraw();
    error TransferFailed();

    /// @param initialTreasury receives platform fees (via `owed`)
    /// @param baseUri fallback ERC-1155 uri for ids without their own uri
    constructor(address initialTreasury, string memory baseUri) ERC1155(baseUri) Ownable(msg.sender) {
        if (initialTreasury == address(0)) revert ZeroAddress();
        treasury = initialTreasury;
    }

    // ───────────────────────── Studios ─────────────────────────

    function publishGame(uint96 price, uint16 royaltyBps, string calldata metadataUri) external returns (uint256 id) {
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();
        id = ++gameCount;
        games[id] = Game(msg.sender, price, royaltyBps, true, metadataUri);
        emit GamePublished(id, msg.sender, price, royaltyBps, metadataUri);
        emit URI(metadataUri, id); // standard ERC-1155 metadata event
    }

    function updateGame(uint256 id, uint96 price, bool active) external {
        Game storage g = games[id];
        if (g.studio != msg.sender) revert NotStudio(); // also rejects unknown ids (studio == 0)
        g.price = price;
        g.active = active;
        emit GameUpdated(id, price, active);
    }

    // ───────────────────────── Primary sales ─────────────────────────

    function buy(uint256 id) external payable nonReentrant {
        Game storage g = games[id];
        if (!g.active) revert GameNotActive(); // unknown ids are never active
        if (msg.value != g.price) revert WrongValue(g.price, msg.value);

        if (msg.value > 0) {
            uint256 fee = (msg.value * feeBps) / BPS;
            owed[treasury] += fee;
            owed[g.studio] += msg.value - fee;
        }
        emit Purchased(id, msg.sender, msg.value);
        // Last: _mint calls onERC1155Received when the buyer is a contract.
        _mint(msg.sender, id, 1, "");
    }

    // ───────────────────────── Resale market ─────────────────────────

    /// @notice Escrow one license of `id` in this contract and list it for `price` wei.
    function list(uint256 id, uint96 price) external nonReentrant returns (uint256 listingId) {
        // Internal move into escrow: no approval needed (caller is the owner) and no receiver hook on ourselves.
        // Reverts with ERC1155InsufficientBalance if the caller holds no copy.
        _move(msg.sender, address(this), id);
        listingId = ++listingCount;
        listings[listingId] = Listing(msg.sender, id, price, true);
        emit Listed(listingId, id, msg.sender, price);
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        emit Cancelled(listingId);
        _safeTransferFrom(address(this), msg.sender, l.gameId, 1, "");
    }

    /// @notice Buy a listed license. Splits: royalty to the studio, platform fee to the treasury, rest to the seller.
    function buyListing(uint256 listingId) external payable nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert ListingNotActive();
        if (msg.value != l.price) revert WrongValue(l.price, msg.value);
        l.active = false;

        uint256 gameId = l.gameId;
        uint256 royalty = (msg.value * games[gameId].royaltyBps) / BPS;
        uint256 fee = (msg.value * feeBps) / BPS;
        // royalty + fee <= 30% of price, so this cannot underflow.
        owed[games[gameId].studio] += royalty;
        owed[treasury] += fee;
        owed[l.seller] += msg.value - royalty - fee;

        emit Sold(listingId, gameId, l.seller, msg.sender, msg.value, royalty, fee);
        _safeTransferFrom(address(this), msg.sender, gameId, 1, "");
    }

    // ───────────────────────── Payouts ─────────────────────────

    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        owed[msg.sender] = 0; // effects before the external call
        emit Withdrawn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ───────────────────────── Admin ─────────────────────────

    function setFee(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = bps;
        emit FeeUpdated(bps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    // ───────────────────────── Views ─────────────────────────

    function uri(uint256 id) public view override returns (string memory) {
        string memory u = games[id].uri;
        return bytes(u).length > 0 ? u : super.uri(id);
    }

    /// @inheritdoc IERC2981
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount)
    {
        Game storage g = games[tokenId];
        return (g.studio, (salePrice * g.royaltyBps) / BPS);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    // ───────────────────────── Internal ─────────────────────────

    /// @dev Moves one copy of `id` without the ERC-1155 receiver check (used only for escrowing into this contract).
    function _move(address from, address to, uint256 id) private {
        uint256[] memory ids = new uint256[](1);
        uint256[] memory values = new uint256[](1);
        ids[0] = id;
        values[0] = 1;
        _update(from, to, ids, values);
    }
}
