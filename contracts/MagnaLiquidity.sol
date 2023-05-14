// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MagnaLiquidity is Ownable {
    using SafeMath for uint256;
    
    address public magna;
    address public usd;
    address public trader;
    
    uint256 public reserve0; // magna amount
    uint256 public reserve1; // usd amount

    uint256 public liquidityFee; // 10 ^ 5
    uint256 public treasuryFee; // 10 ^ 5
    uint256 public FEE_DENOMINATOR = 100_000;
    uint256 public withdrawFee;

    address public feeTo;

    mapping(address => UserInfo) public userInfo;

    struct UserInfo {
        uint256 deposit;
        uint256 balance;
        uint256 lastClaim;
    }

    event Deposit(address _from, uint256 _in, uint256 _out);
    event Withdraw(address _from, uint256 _in, uint256 _out);
    event SendTreasuryReward(address _to, uint256 _amount);
    event SetFeeTo(address _feeTo);
    event SetTrader(address _trader);
    event SetFee(uint256 _totalFee, uint256 _treasuryFee);
    event DepositForFund(uint256 _amount);

    constructor(
        address _magna,
        address _feeTo,
        address _usd
    ) {
        magna = _magna;
        liquidityFee = 2000;
        treasuryFee = 500;
        withdrawFee = 35000;
        // USDT
        // usd = 0x55d398326f99059fF775485246999027B3197955;
        usd = _usd;
        feeTo = _feeTo;
    }

    function reserves() external view returns(uint256, uint256) {
        return (reserve0, reserve1);
    }

    function depositNetAmount(uint256 amount_) external view returns (uint256) {
        return amount_.mul(FEE_DENOMINATOR.sub(liquidityFee).sub(treasuryFee)).div(FEE_DENOMINATOR);
    }

    function userDepositied(address owner_) external view returns (uint256) {
        return userInfo[owner_].deposit;
    }

    function setFeeTo(address _feeTo) external onlyOwner returns (bool) {
        feeTo = _feeTo;
        emit SetFeeTo(_feeTo);
        return true;
    }

    function setTrader(address _trader) external onlyOwner returns (bool) {
        trader = _trader;
        emit SetTrader(_trader);
        return true;
    }

    function setFee(uint256 _liquidityFee, uint256 _treasuryFee) external onlyOwner returns (bool) {
        liquidityFee = _liquidityFee;
        treasuryFee = _treasuryFee;
        emit SetFee(liquidityFee, _treasuryFee);
        return true;
    }

    /* only trader can executable
        transfer magna to trader
        transfer treasury fee to feeTo (usd)
    **/
    function deposit(address _sender) external returns (uint256) {
        require(trader != address(0) && msg.sender == trader, "Only trader can trade");
        IERC20 _usd = IERC20(usd);
        uint256 _amount = _usd.balanceOf(address(this)).sub(reserve1);
        require(_sender != address(0), "Invalid zero address");
        require(_amount > 0, "Invalid zero amount");

        (, uint256 _out,) = _deposit(_sender, _amount);

        return _out;
    }

    function depositForFund(uint256 _amount) external returns (bool) {
        IERC20 usd_ = IERC20(usd);
        require(_amount > 0, "Invalid amount");
        require(usd_.balanceOf(_msgSender()) >= _amount, "Invalid balance");
        require(usd_.allowance(_msgSender(), address(this)) >= _amount, "Invalid allowance");
        IERC20(usd).transferFrom(_msgSender(), address(this), _amount);
        reserve1 = reserve1.add(_amount);
        emit DepositForFund(_amount);
        return true;
    }

    /* only trader can executable
        transfer deposit and 65% reward to sender (usd)
        transfer withdraw fee (35%) to trader (usd)
    **/
    function withdraw(address _sender, uint256 _amount) external returns (uint256, uint256) {
        require(trader != address(0) && msg.sender == trader, "Only trader can trade");
        require(_sender != address(0), "Invalid zero address");
        require(_amount > 0, "Invalid zero amount");

        (, uint256 _out, uint256 deposit_) = _withdraw(_sender, _amount);

        return (_out, deposit_);
    }

    /* only trader can executable
        deduct treasury fee (usd)
        increase reserve0, reserve1
        update userInfo
    **/
    function _deposit(address _sender, uint256 _amount) internal returns (uint256, uint256, uint256) {
        uint256 _totalBalance = IERC20(magna).balanceOf(address(this));

        uint256 _swapAmount = uint256(_amount).mul(FEE_DENOMINATOR.sub(liquidityFee).sub(treasuryFee)).div(FEE_DENOMINATOR);
        uint256 _liquidityFeeAmount = uint256(_amount).mul(liquidityFee).div(FEE_DENOMINATOR);
        uint256 _treasuryFeeAmount = uint256(_amount).sub(_swapAmount).sub(_liquidityFeeAmount);
        uint256 _in = _swapAmount.add(_liquidityFeeAmount);
        uint256 _out = _swapAmount;
        if (reserve0 > 0 && reserve1 > 0) {
            _out = _swapAmount.mul(reserve0).div(reserve1);
        }

        // update userInfo
        if (userInfo[_sender].deposit == 0) userInfo[_sender].lastClaim = block.timestamp;        
        userInfo[_sender].deposit = userInfo[_sender].deposit.add(_swapAmount);
        userInfo[_sender].balance = userInfo[_sender].balance.add(_out);
        // update reserves
        reserve0 = reserve0.add(_out);
        reserve1 = reserve1.add(_in);

        require(reserve0 < _totalBalance, "Not enough Magna in the contract");
        
        if (_treasuryFeeAmount > 0) {
            IERC20(usd).transfer(feeTo, _treasuryFeeAmount);
            emit SendTreasuryReward(feeTo, _treasuryFeeAmount);
        }

        IERC20(magna).transfer(trader, _out);

        emit Deposit(_sender, _swapAmount, _out);

        return (_in, _out, _treasuryFeeAmount);
    }

    /* only trader can executable
        decrease reserve0, reserve1
        update userInfo
    **/
    function _withdraw(address _sender, uint256 _amount) internal returns (uint256, uint256, uint256) {
        require(reserve0 > 0 && reserve1 > 0, "Invalid reserves");
        uint256 _in = _amount; // magna
        uint256 _out = _in.mul(reserve1).div(reserve0); // usd
        require(reserve0 > _in && reserve1 > _out, "Insufficient reserves");
        reserve0 = reserve0.sub(_in);
        reserve1 = reserve1.sub(_out);
        uint256 deposit_ = _in.mul(userInfo[_sender].deposit).div(userInfo[_sender].balance); // usd
        userInfo[_sender].deposit = userInfo[_sender].deposit.sub(deposit_);
        userInfo[_sender].balance = userInfo[_sender].balance.sub(_in);

        IERC20(usd).transfer(trader, _out);
        emit Withdraw(_sender, _in, _out);
        return (_in, _out, deposit_);
    }
}