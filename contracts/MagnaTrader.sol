// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20Custom is IERC20 {
    function decimals() external view returns (uint256);
}

interface IMlmSystem {
    function usersByReferral(address user_) external view returns (address[] memory);
    function usersByReferralLength(address user_) external view returns (uint256);
    function subscriptionIsValid(address owner_) external view returns (bool);
    function userMaxDepositAmount(address owner_) external view returns (uint256);
    function getRecruitors(address user_) external view returns (address[] memory);
}

struct UserInfo {
    uint256 deposit;
    uint256 balance;
    uint256 lastClaim;
}

interface IMagnaLiquidity {
    function deposit(address sender_) external returns (uint256);
    function withdraw(address sender_, uint256 amount_) external returns (uint256, uint256);
    function depositNetAmount(uint256 amount_) external view returns (uint256);
    function userDepositied(address owner_) external view returns (uint256);
    function userInfo(address owner_) external view returns (UserInfo memory);
    function reserves() external view returns (uint256, uint256);
    function liquidityFee() external view returns (uint256);
    function treasuryFee() external view returns (uint256);
    function FEE_DENOMINATOR() external view returns (uint256);
}

contract MagnaTrader is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    address private _magna;
    address private _magnaLiquidity;
    address private _mlmSystem;
    address private _baseToken;

    uint256 private _maxAmountPerBuy;
    uint256 private _maxPurchase;
    uint256 private _purchaseCooldown;

    struct DepositHistory {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => uint256) private _balance;
    mapping(address => mapping(uint256 => DepositHistory)) private _depositHistory;
    mapping(address => uint256) private _depositHistoryLength;
    uint256[] private _withdrawProfitDistribution;
    uint256 private _withdrawProfitFee;
    uint256 public FEE_DENOMINATOR = 100_000;
    address private _feeTo;

    uint256 private _successReward;
    uint256 private _successRewardDirectReferralsMin;
    uint256 private _successRewardInvestVolumeMin;
    uint256 private _autoClaimEpoch;

    event Buy(address sender_, uint256 in_, uint256 out_);
    event Sell(address sender_, uint256 in_, uint256 out_);
    event Reward(address from_, address to_, uint256 amount_);
    event WithdrawRewards(address feeTo_, uint256 amount_);
    event ChangeWithdrawProfitFee(uint256 fee_);
    event ChangeWithdrawProfitDistribution(uint256[] distribution_);
    event ChangeSuccessReward(uint256 reward_);
    event ChangeSuccessRewardRequirement(uint256 referralsMin_, uint256 investVolumeMin_);
    event ChangePurchaseCooldown(uint256 cooldown_);
    event ChangeMaxPurchase(uint256 maxPurchase_);
    event ChangeMaxAmountPerBuy(uint256 amount_);

    constructor(address magna_, address magnaLiquidity_, address mlmSystem_, address usd_) {
        // _baseToken = 0x55d398326f99059fF775485246999027B3197955;
        _baseToken = usd_;
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        _magna = magna_;
        _magnaLiquidity = magnaLiquidity_;
        _mlmSystem = mlmSystem_;
        // set baseToken USDT
        _maxAmountPerBuy = uint256(100).mul(10 ** baseToken_.decimals());
        _maxPurchase = uint256(5000).mul(10 ** baseToken_.decimals());
        _purchaseCooldown = 2 * 86400; // 48h

        _withdrawProfitFee = 35_000;
        _withdrawProfitDistribution.push(6_000);
        _withdrawProfitDistribution.push(3_000);
        _withdrawProfitDistribution.push(2_000);
        _withdrawProfitDistribution.push(2_000);
        _withdrawProfitDistribution.push(2_000);

        _successReward = 6_000;
        _successRewardDirectReferralsMin = 6;
        _successRewardInvestVolumeMin = uint256(7500).mul(10 ** baseToken_.decimals());
        _autoClaimEpoch = 30 * 86400;
    }

    // configuration
    function feeTo() external view returns (address) {
        return _feeTo;
    }

    function withdrawProfitFee() external view returns (uint256) {
        return _withdrawProfitFee;
    }

    function withdrawProfitDistribution() external view returns (uint256[] memory) {
        return _withdrawProfitDistribution;
    }

    function successReward() external view returns (uint256) {
        return _successReward;
    }

    function successRewardRequirement() external view returns (uint256, uint256) {
        return (_successRewardDirectReferralsMin, _successRewardInvestVolumeMin);
    }

    function purchaseCooldown() external view returns (uint256) {
        return _purchaseCooldown;
    }

    function maxPurchase() external view returns (uint256) {
        return _maxPurchase;
    }

    function maxAmountPerBuy() external view returns (uint256) {
        return _maxAmountPerBuy;
    }

    function autoClaimEpoch() external view returns (uint256) {
        return _autoClaimEpoch;
    }

    function magnaBalance(address owner_) external view returns (uint256) {
        return _balance[owner_];
    }

    function depositHistoryLength(address owner_) external view returns (uint256) {
        return _depositHistoryLength[owner_];
    }

    function getDepositHistory(address owner_, uint256 len_) external view returns (DepositHistory[] memory) {
        uint256 length_ = _depositHistoryLength[owner_];
        if (len_ > length_) len_ = length_;
        DepositHistory[] memory history_ = new DepositHistory[](len_);
        for (uint i=0; i<len_; i++) {
            history_[i] = _depositHistory[owner_][length_.sub(i+1)];
        }
        return history_;
    }

    function setAutoClaimEpoch(uint256 autoClaimEpoch_) external onlyOwner returns (bool) {
        _autoClaimEpoch = autoClaimEpoch_;
        return true;
    }

    function getPurchaseLimit(address owner_) public view returns (uint256) {
        IMlmSystem mlmSystem_ = IMlmSystem(_mlmSystem);
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);

        // user's subscribtion must not be ended
        if (mlmSystem_.subscriptionIsValid(owner_) == false) return 0;

        uint256 amount_ = _maxPurchase;
        if (_depositHistoryLength[owner_] > 0) {
            for (uint i = _depositHistoryLength[owner_]; i > 0; i--) {
                if (_depositHistory[owner_][i-1].timestamp.add(_purchaseCooldown) >= block.timestamp) {
                    amount_ = amount_.sub(_depositHistory[owner_][i-1].amount);
                } else break;
            }
        }

        uint256 userDeposited_ = magnaLiquidity_.userDepositied(owner_);
        uint256 maxDeposit_ = mlmSystem_.userMaxDepositAmount(owner_);
        uint256 depositNetAmount_ = magnaLiquidity_.depositNetAmount(amount_);

        // amount must smaller than limit
        if (maxDeposit_ > 0) { // if 0, no limit
            if (userDeposited_.add(depositNetAmount_) > maxDeposit_) {
                amount_ = amount_.mul(maxDeposit_.sub(userDeposited_)).div(depositNetAmount_);
            }
        }
        return amount_;
    }

    function setFeeTo(address feeTo_) external onlyOwner returns (bool) {
        _feeTo = feeTo_;
        return true;
    }

    function setWithdrawProfitFee(uint256 fee_) external onlyOwner returns (bool) {
        _withdrawProfitFee = fee_;
        emit ChangeWithdrawProfitFee(_withdrawProfitFee);
        return true;
    }

    function setWithdrawProfitDistribution(uint256[] memory distribution_) external onlyOwner returns (bool) {
        _withdrawProfitDistribution = distribution_;
        emit ChangeWithdrawProfitDistribution(distribution_);
        return true;
    }

    function setSuccessReward(uint256 reward_) external onlyOwner returns (bool) {
        _successReward = reward_;
        emit ChangeSuccessReward(_successReward);
        return true;
    }

    function setSuccessRewardRequirement(uint256 referralsMin_, uint256 investVolumeMin_) external onlyOwner returns (bool) {
        _successRewardDirectReferralsMin = referralsMin_;
        _successRewardInvestVolumeMin = investVolumeMin_;
        emit ChangeSuccessRewardRequirement(_successRewardDirectReferralsMin, _successRewardInvestVolumeMin);
        return true;
    }

    function setPurchaseCooldown(uint256 cooldown_) external onlyOwner returns (bool) {
        _purchaseCooldown = cooldown_;
        emit ChangePurchaseCooldown(_purchaseCooldown);
        return true;
    }

    function setMaxPurchase(uint256 maxPurchase_) external onlyOwner returns (bool) {
        _maxPurchase = maxPurchase_;
        emit ChangeMaxPurchase(_maxPurchase);
        return true;
    }

    function setMaxAmountPerBuy(uint256 amount_) external onlyOwner returns (bool) {
        _maxAmountPerBuy = amount_;
        emit ChangeMaxAmountPerBuy(_maxAmountPerBuy);
        return true;
    }

    // end configuration

    /* buy magna token
        check user subscription is valid
        check user amount limit
        check user deposit rate limit
        check allowance of usd token
    **/
    function buy(uint256 amount_) external nonReentrant returns (bool) {
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);
        
        uint256 limit_ = getPurchaseLimit(_msgSender());
        require(amount_ <= limit_, "Purchase amount exceeds limit");
        // check allowance
        require(baseToken_.allowance(_msgSender(), address(this)) >= amount_, "Invalid allowance");

        // add depositHistory
        uint256 depositHistoryLength_ = _depositHistoryLength[_msgSender()];
        _depositHistory[_msgSender()][depositHistoryLength_] = DepositHistory({amount: amount_, timestamp: block.timestamp});
        _depositHistoryLength[_msgSender()] = depositHistoryLength_ + 1;

        // buy tokens _maxAmountPerBuy each time
        uint256 receivedMagna_;
        uint256 loopCount_ = amount_.div(_maxAmountPerBuy).add(1);
        for (uint i=0; i<loopCount_; i++) {
            if (amount_ > _maxAmountPerBuy) {
                amount_ = amount_.sub(_maxAmountPerBuy);
                baseToken_.transferFrom(_msgSender(), _magnaLiquidity, _maxAmountPerBuy);
                receivedMagna_ = receivedMagna_.add(magnaLiquidity_.deposit(_msgSender()));
            } else if (amount_ > 0) {
                baseToken_.transferFrom(_msgSender(), _magnaLiquidity, amount_);
                receivedMagna_ = receivedMagna_.add(magnaLiquidity_.deposit(_msgSender()));
                break;
            }
        }

        _balance[_msgSender()] = _balance[_msgSender()].add(receivedMagna_);

        emit Buy(_msgSender(), magnaLiquidity_.depositNetAmount(amount_), receivedMagna_);
        return true;
    }

    function getAmounts(uint256 _in) external view returns (uint256) {
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);
        (uint256 reserve0, uint256 reserve1) = magnaLiquidity_.reserves();
        uint256[3] memory fees = [
            magnaLiquidity_.treasuryFee(),
            magnaLiquidity_.liquidityFee(),
            magnaLiquidity_.FEE_DENOMINATOR()
        ];
        uint256 _out = 0;
        uint256 _loopCount = _in.div(_maxAmountPerBuy).add(1);
        for (uint i = 0; i < _loopCount; i++) {
            if (_in > _maxAmountPerBuy) {
                _in = _in.sub(_maxAmountPerBuy);
                uint256 received = _maxAmountPerBuy.mul(fees[2].sub(fees[1]).sub(fees[0])).div(fees[2]);
                if (reserve1 > 0) received = received.mul(reserve0).div(reserve1);
                _out = _out.add(received);
                reserve0 = reserve0.add(received);
                reserve1 = reserve1.add(_maxAmountPerBuy.mul(fees[2].sub(fees[0])).div(fees[2]));
            } else if (_in > 0) {
                uint256 received = _in.mul(fees[2].sub(fees[1]).sub(fees[0])).div(fees[2]);
                if (reserve1 > 0) received = received.mul(reserve0).div(reserve1);
                _out = _out.add(received);
                break;
            }
        }
        return _out;
    }

    /* sell magna token
        check allowance of magna token
    **/
    function sell(uint256 amount_) external nonReentrant returns (bool) {
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);

        (uint256 initialDeposit_, uint256 userProfit_) = _sell(_msgSender(), amount_);
        baseToken_.transfer(_msgSender(), initialDeposit_.add(userProfit_));
        emit Sell(_msgSender(), amount_, initialDeposit_.add(userProfit_));
        return true;
    }

    function _sell(address from_, uint256 amount_) internal returns(uint256, uint256) {
        require(_balance[from_] >= amount_, "Invalid amount");
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);
        IERC20Custom magna_ = IERC20Custom(_magna);

        _balance[from_] = _balance[from_].sub(amount_);

        magna_.transfer(_magnaLiquidity, amount_);
        (uint256 out_, uint256 initialDeposit_) = magnaLiquidity_.withdraw(from_, amount_);

        // send initialDeposit_ + 65% profit to user
        uint256 userProfit_ = out_.sub(initialDeposit_).mul(FEE_DENOMINATOR.sub(_withdrawProfitFee)).div(FEE_DENOMINATOR);

        _distributeRewardsToRecruitors(from_, out_, initialDeposit_);
        return (initialDeposit_, userProfit_);
    }

    function _distributeRewardsToRecruitors(address from_, uint256 out_, uint256 initialDeposit_) internal returns (bool) {
        IMlmSystem mlmSystem_ = IMlmSystem(_mlmSystem);
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        // send 35% profit to recruitors
        address[] memory recruitors_ = mlmSystem_.getRecruitors(from_);
        uint256 totalReward_ = out_.sub(initialDeposit_);

        for (uint i = 0; i < recruitors_.length; i++) {
            if (recruitors_[i] == address(0)) continue;
            // level reward
            uint256 reward_ = totalReward_.mul(FEE_DENOMINATOR.sub(_withdrawProfitFee)).div(FEE_DENOMINATOR).mul(_withdrawProfitDistribution[i]).div(FEE_DENOMINATOR);
            // success reward
            address[] memory users = mlmSystem_.usersByReferral(recruitors_[i]);
            uint256 total_deposits_;
            for (uint j=0; j<users.length; j++) {
                total_deposits_ = total_deposits_.add(magnaLiquidity_.userDepositied(users[j]));
            }
            if (users.length >= _successRewardDirectReferralsMin &&  total_deposits_ >= _successRewardInvestVolumeMin) reward_ = reward_.add(totalReward_.mul(FEE_DENOMINATOR.sub(_withdrawProfitFee)).div(FEE_DENOMINATOR).mul(_successReward).div(FEE_DENOMINATOR));
            baseToken_.transfer(recruitors_[i], reward_);
            emit Reward(from_, recruitors_[i], reward_);
        }
        return true;
    }

    function autoWithdraw(address from_) external returns (bool) {
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        IMagnaLiquidity magnaLiquidity_ = IMagnaLiquidity(_magnaLiquidity);
        IMlmSystem mlmSystem_ = IMlmSystem(_mlmSystem);
        require(_balance[from_] > 0, "Invalid amount");
        require(magnaLiquidity_.userInfo(from_).lastClaim + _autoClaimEpoch <= block.timestamp, "Can't withdraw now");
        (uint256 initialDeposit_, uint256 userProfit_) = _sell(from_, _balance[from_]);

        emit Sell(_msgSender(), _balance[from_], initialDeposit_.add(userProfit_));
        uint256 amount_ = initialDeposit_.add(userProfit_);
        
        if (!mlmSystem_.subscriptionIsValid(from_)) {
            baseToken_.transfer(from_, amount_);
            return true;
        }

        uint256 receivedMagna_;
        uint256 loopCount_ = amount_.div(_maxAmountPerBuy).add(1);
        for (uint i=0; i<loopCount_; i++) {
            if (amount_ > _maxAmountPerBuy) {
                amount_ = amount_.sub(_maxAmountPerBuy);
                baseToken_.transfer(_magnaLiquidity, _maxAmountPerBuy);
                receivedMagna_ = receivedMagna_.add(magnaLiquidity_.deposit(from_));
            } else if (amount_ > 0) {
                baseToken_.transfer(_magnaLiquidity, amount_);
                receivedMagna_ = receivedMagna_.add(magnaLiquidity_.deposit(from_));
            }
        }

        _balance[from_] = _balance[from_].add(receivedMagna_);

        emit Buy(from_, magnaLiquidity_.depositNetAmount(amount_), receivedMagna_);
        return true;
    }

    function withdrawRewards() external onlyOwner returns (bool) {
        IERC20Custom baseToken_ = IERC20Custom(_baseToken);
        uint256 balance_ = baseToken_.balanceOf(address(this));
        require(balance_ > 0, "No balance");
        baseToken_.transfer(_feeTo, balance_);
        emit WithdrawRewards(_feeTo, balance_);
        return true;
    }

}
