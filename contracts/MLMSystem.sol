// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20Custom is IERC20 {
    function decimals() external view returns (uint256);
}

contract MLMSystem is ReentrancyGuard, Ownable {
    using SafeMath for uint256;

    struct UserInfo {
        address referral;
        uint256 registeredAt;
        uint256 subscriptionLevel;
    }

    struct Subscription {
        uint256 openLimit;
        uint256 depositMax;
        uint256 livePeriod; // month
        uint256 price;
    }

    uint256 private _periodUnit = 30 * 86400;

    mapping(address => address[]) private _usersByReferral;
    mapping(uint256 => Subscription) private _subscriptions;
    mapping(address => UserInfo) private _userInfos;

    uint256 private _subscriptionLevelsLength;
    uint256 private _openLimitMax;

    address private _baseToken;
    address public injectWallet;
    uint256 public injectAmount;
    address public treasuryWallet;
    uint256 public injected;
    address public signer;

    mapping(uint256 => bool) promotions;

    event Subscribe(
        address user_,
        uint256 registeredAt_,
        uint256 subscriptionLevel_,
        address referral_
    );

    event ChangeSubscription(uint256 index_, Subscription subscription_);

    constructor(address token_, address signer_) {
        // set baseToken
        _baseToken = token_;
        // _baseToken = 0x55d398326f99059fF775485246999027B3197955;
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        uint256 decimals_ = baseToken_.decimals();
        // there are 3 subscriptions-regular, lite, supreme
        _subscriptions[0] = Subscription({
            openLimit: 1,
            depositMax: uint256(19_999).mul(10 ** decimals_),
            livePeriod: 12,
            price: uint256(250).mul(10 ** decimals_)
        });
        _subscriptions[1] = Subscription({
            openLimit: 3,
            depositMax: uint256(49_999).mul(10 ** decimals_),
            livePeriod: 12,
            price: uint256(550).mul(10 ** decimals_)
        });
        _subscriptions[2] = Subscription({
            openLimit: 5,
            depositMax: 0, // unlimited
            livePeriod: 12,
            price: uint256(970).mul(10 ** decimals_)
        });
        _subscriptionLevelsLength = 3;
        _openLimitMax = 5;
        // set referral as level 3(infinity)
        _usersByReferral[address(0)] = [0x6f0f1B0fa7A150f17490b2369852c5d0f5D2C9d4];
        _userInfos[0x6f0f1B0fa7A150f17490b2369852c5d0f5D2C9d4] = UserInfo({
            referral: address(0),
            registeredAt: block.timestamp,
            subscriptionLevel: _subscriptionLevelsLength
        });
        injectWallet = 0xEd6dE04a75ECcCb17a8dcB363334018311A822C2;
        treasuryWallet = 0x85fAc42f49fEE17f6035Cb700060876fE4430dAd;
        injectAmount = uint256(10).mul(10 ** decimals_);
        signer = signer_;
    }

    function usersByReferral(
        address user_
    ) external view returns (address[] memory) {
        return _usersByReferral[user_];
    }

    function userByReferral(
        address user_,
        uint256 index_
    ) external view returns (address) {
        return _usersByReferral[user_][index_];
    }

    function usersByReferralLength(
        address user_
    ) external view returns (uint256) {
        return _usersByReferral[user_].length;
    }

    function subscription(
        uint256 index_
    ) external view returns (Subscription memory) {
        return _subscriptions[index_];
    }

    function userInfo(address user_) external view returns (UserInfo memory) {
        return _userInfos[user_];
    }

    function baseToken() external view returns (address) {
        return _baseToken;
    }

    function periodUnit() external view returns (uint256) {
        return _periodUnit;
    }

    function referralDepthMax() external view returns (uint256) {
        return _openLimitMax;
    }

    function changeSubscription(uint256 index_, uint256 openLimit_, uint256 depositMax_, uint256 livePeriod_, uint256 price_) external onlyOwner returns (bool) {
        require(index_ < _subscriptionLevelsLength, "Invalid index");
        if (index_ > 0) {
            Subscription memory subscriptionBefore_ = _subscriptions[index_.sub(1)];
            require(subscriptionBefore_.openLimit <= openLimit_, "Invalid open limit order");
            require(subscriptionBefore_.depositMax <= depositMax_, "Invalid deposit max order");
            require(subscriptionBefore_.depositMax <= livePeriod_, "Invalid live period order");
            require(subscriptionBefore_.depositMax <= price_, "Invalid price order");
        }
        if (index_ < _subscriptionLevelsLength.sub(1)) {
            Subscription memory subscriptionAfter_ = _subscriptions[index_.add(1)];
            require(openLimit_ <= subscriptionAfter_.openLimit, "Invalid open limit order");
            require(depositMax_ <= subscriptionAfter_.depositMax, "Invalid deposit max order");
            require(livePeriod_ <= subscriptionAfter_.depositMax, "Invalid live period order");
            require(price_ <= subscriptionAfter_.depositMax, "Invalid price order");
        }
        _subscriptions[index_] = Subscription({
            openLimit: openLimit_,
            depositMax: depositMax_,
            livePeriod: livePeriod_,
            price: price_
        });
        emit ChangeSubscription(index_, _subscriptions[index_]);
        return true;
    }

    function subscriptionIsValid(address owner_) public view returns (bool) {
        uint256 subscriptionLevel_ = _userInfos[owner_].subscriptionLevel;
        if (subscriptionLevel_ == _subscriptionLevelsLength) return true;
        Subscription memory userSubscription_ = _subscriptions[
            subscriptionLevel_
        ];
        return
            _userInfos[owner_].registeredAt.add(
                _periodUnit.mul(userSubscription_.livePeriod)
            ) >= block.timestamp;
    }

    function subscriptionOpenLimit(
        address owner_
    ) public view returns (uint256) {
        uint256 subscriptionLevel_ = _userInfos[owner_].subscriptionLevel;
        if (subscriptionLevel_ == _subscriptionLevelsLength) return _openLimitMax;
        Subscription memory userSubscription_ = _subscriptions[
            subscriptionLevel_
        ];
        return userSubscription_.openLimit;
    }

    function userMaxDepositAmount(
        address owner_
    ) external view returns (uint256) {
        uint256 subscriptionLevel_ = _userInfos[owner_].subscriptionLevel;
        if (subscriptionLevel_ == _subscriptionLevelsLength) return 0;
        return _subscriptions[subscriptionLevel_].depositMax;
    }

    function getRecruitors(
        address user_
    ) external view returns (address[] memory) {
        address[] memory recruitors_ = new address[](_openLimitMax);
        address referred = user_;
        for (uint i = 0; i < _openLimitMax; i++) {
            if (_userInfos[referred].subscriptionLevel == _subscriptionLevelsLength) break;
            address referral_ = _userInfos[referred].referral;
            recruitors_[i] = address(0);
            if (
                subscriptionIsValid(referral_) &&
                subscriptionOpenLimit(referral_) > i
            ) {
                recruitors_[i] = referral_;
            }
            referred = referral_;
        }
        return recruitors_;
    }
    
    function changeInjectWallet(address inject_) external onlyOwner returns (address) {
        injectWallet = inject_;
        return injectWallet;
    }

    function changeTreasuryWallet(address treasury_) external onlyOwner returns (address) {
        treasuryWallet = treasury_;
        return treasuryWallet;
    }

    function changeInjectAmount(uint256 amount_) external onlyOwner returns (uint256) {
        injectAmount = amount_;
        return injectAmount;
    }

    function changeSigner(address signer_) external onlyOwner returns (address) {
        signer = signer_;
        return signer;
    }

    function getMessageHash(
        uint256 _nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_nonce));
    }

    function getEthSignedMessageHash(
        bytes32 _messageHash
    ) public pure returns (bytes32) {
        /*
        Signature is produced by signing a keccak256 hash with the following format:
        "\x19Ethereum Signed Message\n" + len(msg) + msg
        */
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", _messageHash)
            );
    }

    function verify(
        uint256 _nonce,
        bytes memory signature
    ) public view returns (bool) {
        bytes32 messageHash = getMessageHash(_nonce);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethSignedMessageHash, signature) == signer;
    }

    function verifyPromotion(
        uint256 _nonce,
        bytes memory signature
    ) public view returns (bool) {
        bytes32 messageHash = getMessageHash(_nonce);
        bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

        return recoverSigner(ethSignedMessageHash, signature) == signer && promotions[_nonce] == false;
    }

    function recoverSigner(
        bytes32 _ethSignedMessageHash,
        bytes memory _signature
    ) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(
        bytes memory sig
    ) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            /*
            First 32 bytes stores the length of the signature

            add(sig, 32) = pointer of sig + 32
            effectively, skips first 32 bytes of signature

            mload(p) loads next 32 bytes starting at the memory address p into memory
            */

            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        // implicitly return (r, s, v)
    }

    function subscribeWithCode(
        address referral_,
        uint256 nonce_,
        bytes memory signature_
    ) external nonReentrant returns (bool) {
        uint256 index_ = 0;
        UserInfo memory referralInfo_ = _userInfos[referral_];
        UserInfo memory userInfo_ = _userInfos[_msgSender()];
        require(verify(nonce_, signature_), "Invalid signature");
        require(promotions[nonce_] == false, "Nonce is used");
        promotions[nonce_] = true;
        // check level is higher than prev level
        require(
            userInfo_.registeredAt <=
                block.timestamp.sub(
                    _subscriptions[userInfo_.subscriptionLevel].livePeriod.mul(
                        _periodUnit
                    )
                ) ||
                index_ > userInfo_.subscriptionLevel,
            "Can only subscribe with high level"
        );
        // check referral address is valid
        require(
            referralInfo_.subscriptionLevel >= _subscriptionLevelsLength || referralInfo_.registeredAt.add(
                    _subscriptions[referralInfo_.subscriptionLevel]
                        .livePeriod
                        .mul(_periodUnit)
                ) >=
                block.timestamp,
            "Referral address is not valid"
        );

        for (uint i = 0; i < _usersByReferral[userInfo_.referral].length; i++) {
            if (_usersByReferral[userInfo_.referral][i] == _msgSender()) {
                for (
                    uint j = i + 1;
                    j < _usersByReferral[userInfo_.referral].length;
                    j++
                ) {
                    _usersByReferral[userInfo_.referral][
                        j - 1
                    ] = _usersByReferral[userInfo_.referral][j];
                }
                _usersByReferral[userInfo_.referral].pop();
            }
        }
        // subscribe user
        _userInfos[_msgSender()] = UserInfo({
            referral: referral_,
            registeredAt: block.timestamp,
            subscriptionLevel: index_
        });
        _usersByReferral[referral_].push(_msgSender());

        emit Subscribe(msg.sender, block.timestamp, index_, referral_);

        return true;
    }

    function subscribe(
        address referral_,
        uint256 index_
    ) external nonReentrant returns (bool) {
        Subscription memory subscription_ = _subscriptions[index_];
        UserInfo memory referralInfo_ = _userInfos[referral_];
        UserInfo memory userInfo_ = _userInfos[_msgSender()];
        // check level is valid
        require(index_ < _subscriptionLevelsLength, "Invalid subscription level");
        // check level is higher than prev level
        require(
            userInfo_.registeredAt <=
                block.timestamp.sub(
                    _subscriptions[userInfo_.subscriptionLevel].livePeriod.mul(
                        _periodUnit
                    )
                ) ||
                index_ > userInfo_.subscriptionLevel,
            "Can only subscribe with high level"
        );
        // check referral address is valid
        require(
            referralInfo_.subscriptionLevel >= _subscriptionLevelsLength || referralInfo_.registeredAt.add(
                    _subscriptions[referralInfo_.subscriptionLevel]
                        .livePeriod
                        .mul(_periodUnit)
                ) >=
                block.timestamp,
            "Referral address is not valid"
        );
        // check usd is approved
        require(
            subscription_.price <=
                IERC20Custom(_baseToken).allowance(_msgSender(), address(this)),
            "Token is not approved"
        );

        for (uint i = 0; i < _usersByReferral[userInfo_.referral].length; i++) {
            if (_usersByReferral[userInfo_.referral][i] == _msgSender()) {
                for (
                    uint j = i + 1;
                    j < _usersByReferral[userInfo_.referral].length;
                    j++
                ) {
                    _usersByReferral[userInfo_.referral][
                        j - 1
                    ] = _usersByReferral[userInfo_.referral][j];
                }
                _usersByReferral[userInfo_.referral].pop();
            }
        }
        // transfer token to this contract
        IERC20Custom(_baseToken).transferFrom(
            _msgSender(),
            address(this),
            subscription_.price
        );
        injected = injected.add(injectAmount);
        // subscribe user
        _userInfos[_msgSender()] = UserInfo({
            referral: referral_,
            registeredAt: block.timestamp,
            subscriptionLevel: index_
        });
        _usersByReferral[referral_].push(_msgSender());

        emit Subscribe(msg.sender, block.timestamp, index_, referral_);

        return true;
    }

    function withdrawAll() external onlyOwner returns (bool) {
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        uint256 amount_ = baseToken_.balanceOf(address(this));
        require(amount_ > injected, "Invalid balance");
        baseToken_.transfer(injectWallet, injected);
        baseToken_.transfer(treasuryWallet, amount_.sub(injected));
        injected = 0;
        return true;
    }
}
