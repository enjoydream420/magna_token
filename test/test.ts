import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Test MAGNA contract", () => {

  async function beforeTest() {
    // get users
    const [owner, user] = await ethers.getSigners()

    const magnaContract = await ethers.getContractFactory("MagnaToken")
    const magna = await magnaContract.deploy()

    return { owner, user, magna }
  }

  describe('check config', () => {
    it("token name is Magna Token", async () => {
      const { magna } = await beforeTest()
      expect(await magna.name()).to.equal("Magna Token")
    })
    it("token symbol is MAGNA", async () => {
      const { magna } = await beforeTest()
      expect(await magna.symbol()).to.equal("MAGNA")
    })
    it("token decimal is 18", async () => {
      const { magna } = await beforeTest()
      expect(await magna.decimals()).to.equal(18)
    })
  })

  describe("check whitelist", () => {
    it("check whitelist", async () => {
      const { magna, owner, user } = await beforeTest()
      expect(magna.connect(user).addWhitelist(magna.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).addWhitelist(magna.address)).not.to.be.reverted
      expect(magna.addWhitelist(magna.address)).to.be.revertedWith("Whitelist: already added")
      expect(magna.connect(user).removeWhitelist(magna.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).removeWhitelist(magna.address)).not.to.be.reverted
      expect(magna.removeWhitelist(magna.address)).to.be.revertedWith("Whitelist: already removed")
    })
  })

  describe("check transfer", () => {
    it("check transfer to another wallet", async () => {
      const { magna, user } = await beforeTest()
      expect(await magna.transfer(user.address, "1000000000000000000")).not.to.be.reverted
      expect(await magna.balanceOf(user.address)).to.equal("1000000000000000000")
    })
    it("check transfer to contract", async () => {
      const { magna } = await beforeTest()
      expect(magna.transfer(magna.address, "1000000000000000000")).to.be.revertedWith("ERC20: transfer from the unregistered contract")
      expect(await magna.addWhitelist(magna.address)).not.to.be.reverted
      expect(magna.transfer(magna.address, "1000000000000000000")).not.to.be.reverted
      expect(await magna.balanceOf(magna.address)).to.equal("1000000000000000000")
    })
  })
});

describe("Test MLMSystem", () => {
  async function beforeTest() {
    // get users
    const [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, signer] = await ethers.getSigners()

    const referral = "0x6f0f1B0fa7A150f17490b2369852c5d0f5D2C9d4"
    const usdContract = await ethers.getContractFactory("Test")
    const usd = await usdContract.deploy()

    const mlmContract = await ethers.getContractFactory("MLMSystem")
    const mlm = await mlmContract.deploy(usd.address, signer.address)

    return { owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, signer, referral, mlm, usd }
  }

  describe('check config', () => {
    it("check base token", async () => {
      const { mlm, usd } = await beforeTest()
      expect(await mlm.baseToken()).to.equal(usd.address)
    })
    it("check period unit", async () => {
      const { mlm, usd } = await beforeTest()
      expect(await mlm.periodUnit()).to.equal(30 * 86400)
    })
    it("check change subscription", async () => {
      const { mlm, usd } = await beforeTest()
      expect(mlm.changeSubscription(0, "150000000000000000000", 12, "300000000000000000000")).not.to.be.reverted
    })
  })
  describe('check deposit', () => {
    it("check single deposit", async () => {
      const { mlm, usd, owner, user1, referral } = await beforeTest()
      expect(mlm.subscribe(referral, 3)).to.be.revertedWith("Invalid subscription level")
      expect(mlm.subscribe(owner.address, 0)).to.be.revertedWith("Referral address is not valid")
      expect(mlm.subscribe(referral, 0)).to.be.revertedWith("Token is not approved")
      //subscription 1
      await usd.approve(mlm.address, "250000000000000000000")
      expect(await mlm.subscribe(referral, 0)).not.to.be.reverted
      let userInfo = await mlm.userInfo(owner.address)
      expect(userInfo.registeredAt).to.be.equal(await time.latest())
      expect(userInfo.subscriptionLevel).to.be.equal(0)
      expect(userInfo.referral).to.be.equal(referral)
      // subscription 2
      await usd.approve(mlm.address, "550000000000000000000")
      expect(await mlm.subscribe(referral, 1)).not.to.be.reverted
      userInfo = await mlm.userInfo(owner.address)
      expect(userInfo.registeredAt).to.be.equal(await time.latest())
      expect(userInfo.subscriptionLevel).to.be.equal(1)
      expect(userInfo.referral).to.be.equal(referral)
      // subscription 3
      await usd.approve(mlm.address, "970000000000000000000")
      expect(await mlm.subscribe(referral, 2)).not.to.be.reverted
      userInfo = await mlm.userInfo(owner.address)
      expect(userInfo.registeredAt).to.be.equal(await time.latest())
      expect(userInfo.subscriptionLevel).to.be.equal(2)
      expect(userInfo.referral).to.be.equal(referral)

      expect(await mlm.userMaxDepositAmount(owner.address)).to.be.equal(0)
      expect(await mlm.subscriptionOpenLimit(owner.address)).to.be.equal(5)
      await mlm.withdrawAll()
      expect(await usd.balanceOf("0xEd6dE04a75ECcCb17a8dcB363334018311A822C2")).to.be.equal("30000000000000000000")
      expect(await usd.balanceOf("0x85fAc42f49fEE17f6035Cb700060876fE4430dAd")).to.be.equal("1740000000000000000000")
    })
    it("check milti deposit", async () => {
      const { mlm, usd, owner, user1, user2, referral } = await beforeTest()
      //subscription 1
      await usd.approve(mlm.address, "250000000000000000000")
      expect(await mlm.subscribe(referral, 0)).not.to.be.reverted
      await usd.transfer(user1.address, "250000000000000000000")
      await usd.connect(user1).approve(mlm.address, "250000000000000000000")
      expect(await mlm.connect(user1).subscribe(owner.address, 0)).not.to.be.reverted
      await usd.transfer(user2.address, "550000000000000000000")
      await usd.connect(user2).approve(mlm.address, "550000000000000000000")
      expect(await mlm.connect(user2).subscribe(user1.address, 1)).not.to.be.reverted
      let recruitors = await mlm.getRecruitors(referral)
      expect(recruitors[0]).to.be.equal("0x0000000000000000000000000000000000000000")
      recruitors = await mlm.getRecruitors(owner.address)
      expect(recruitors[0]).to.be.equal(referral)
      recruitors = await mlm.getRecruitors(user1.address)
      expect(recruitors[0]).to.be.equal(owner.address)
      expect(recruitors[1]).to.be.equal(referral)
      recruitors = await mlm.getRecruitors(user2.address)
      expect(recruitors[0]).to.be.equal(user1.address)
      expect(recruitors[1]).not.to.be.equal(owner.address)
      expect(recruitors[2]).to.be.equal(referral)
      let downline = await mlm.usersByReferral(owner.address)
      expect(downline[0]).to.be.equal(user1.address)
    })
    it("check subscription expire", async () => {
      const { mlm, usd, owner, user1, user2, referral } = await beforeTest()
      //subscription 1
      await usd.approve(mlm.address, "250000000000000000000")
      expect(await mlm.subscribe(referral, 0)).not.to.be.reverted
      expect(await mlm.subscriptionIsValid(owner.address)).to.be.equal(true)
      await time.increase(86400 * 30 * 12 + 1)
      expect(await mlm.subscriptionIsValid(owner.address)).to.be.equal(false)
      await usd.transfer(user1.address, "250000000000000000000")
      await usd.connect(user1).approve(mlm.address, "250000000000000000000")
      expect(mlm.connect(user1).subscribe(owner.address, 0)).to.be.revertedWith("Referral address is not valid")
    })
    it("check change recruitor", async () => {
      const { mlm, usd, owner, user1, user2, user3, referral } = await beforeTest()
      await usd.approve(mlm.address, "250000000000000000000")
      expect(await mlm.subscribe(referral, 0)).not.to.be.reverted
      await usd.transfer(user1.address, "250000000000000000000")
      await usd.connect(user1).approve(mlm.address, "250000000000000000000")
      expect(await mlm.connect(user1).subscribe(owner.address, 0)).not.to.be.reverted
      let recruitor = await mlm.userInfo(user1.address)
      expect(recruitor.referral).to.be.equal(owner.address)
      let downlines = await mlm.usersByReferral(owner.address)
      expect(downlines[0]).to.be.equal(user1.address)
      await time.increase(86400 * 30 * 12 + 1)
      recruitor = await mlm.userInfo(user1.address)
      expect(recruitor.referral).to.be.equal(owner.address)
      downlines = await mlm.usersByReferral(owner.address)
      expect(downlines[0]).to.be.equal(user1.address)
      await usd.transfer(user1.address, "250000000000000000000")
      await usd.connect(user1).approve(mlm.address, "250000000000000000000")
      expect(await mlm.connect(user1).subscribe(referral, 0)).not.to.be.reverted
      recruitor = await mlm.userInfo(user1.address)
      expect(recruitor.referral).to.be.equal(referral)
      downlines = await mlm.usersByReferral(owner.address)
      expect(downlines[0]).to.be.equal(undefined)
      downlines = await mlm.usersByReferral(referral)
      expect(downlines[0]).to.be.equal(owner.address)
      expect(downlines[1]).to.be.equal(user1.address)
    })
    it("test promotion", async () => {
      const { mlm, usd, owner, user1, user2, user3, referral, signer } = await beforeTest()
      const hashData = ethers.utils.solidityKeccak256(["uint256"], ["1"])
      const signature = await signer.signMessage(ethers.utils.arrayify(hashData));
      // // const r = signature.slice(0, 66);
      // // const s = "0x" + signature.slice(66, 130);
      // // const v = parseInt(signature.slice(130, 132), 16);
      // console.log(await mlm.verify("1", signature))
      expect(await mlm.subscribeWithCode(referral, "1", signature)).not.to.be.reverted
      expect(await mlm.subscriptionIsValid(owner.address)).to.be.equal(true)
      expect(mlm.connect(user1).subscribeWithCode(referral, "1", signature)).to.be.revertedWith("Nonce is used")
    })
  })
})

describe("Test MagnaLiquidity And MagnaTrader", () => {
  async function beforeTest() {
    // get users
    const [owner, user0_1, user0_2, user0_3, user0_4, user0_5, user0_6, user0_1_0, user0_1_1, user0_1_2, user0_1_3, user0_1_4, user0_1_5, user0_1_6, user0_1_7, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, feeTo, signer] = await ethers.getSigners()
    const referral = "0x6f0f1B0fa7A150f17490b2369852c5d0f5D2C9d4"

    const usdContract = await ethers.getContractFactory("Test")
    const usd = await usdContract.deploy()
    const mlmContract = await ethers.getContractFactory("MLMSystem")
    const mlm = await mlmContract.deploy(usd.address, signer.address)
    
    const magnaContract = await ethers.getContractFactory("MagnaToken")
    const magna = await magnaContract.deploy()
    
    const magnaLiquidityContract = await ethers.getContractFactory("MagnaLiquidity")
    const liquidity = await magnaLiquidityContract.deploy(magna.address, feeTo.address, usd.address)
    
    const magnaTraderContract = await ethers.getContractFactory("MagnaTrader")
    const trader = await magnaTraderContract.deploy(magna.address, liquidity.address, mlm.address, usd.address)

    await liquidity.setTrader(trader.address)

    return { owner, user0_1, user0_2, user0_3, user0_4, user0_5, user0_6, user0_1_0, user0_1_1, user0_1_2, user0_1_3, user0_1_4, user0_1_5, user0_1_6, user0_1_7, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, feeTo, signer, referral, mlm, usd, magna, liquidity, trader }
  }
  async function configMLM() {
    const { owner, user0_1, user0_2, user0_3, user0_4, user0_5, user0_6, user0_1_0, user0_1_1, user0_1_2, user0_1_3, user0_1_4, user0_1_5, user0_1_6, user0_1_7, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, feeTo, referral, mlm, usd, magna, liquidity, trader } = await beforeTest()

    await usd.approve(mlm.address, "970000000000000000000")
    await mlm.subscribe(referral, 2)

    await usd.transfer(user0_1.address, "550000000000000000000")
    await usd.connect(user0_1).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_1).subscribe(owner.address, 1)

    await usd.transfer(user0_2.address, "250000000000000000000")
    await usd.connect(user0_2).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_2).subscribe(owner.address, 0)

    await usd.transfer(user0_3.address, "970000000000000000000")
    await usd.connect(user0_3).approve(mlm.address, "970000000000000000000")
    await mlm.connect(user0_3).subscribe(owner.address, 2)

    await usd.transfer(user0_4.address, "550000000000000000000")
    await usd.connect(user0_4).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_4).subscribe(owner.address, 1)

    await usd.transfer(user0_5.address, "250000000000000000000")
    await usd.connect(user0_5).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_5).subscribe(owner.address, 0)

    await usd.transfer(user0_6.address, "550000000000000000000")
    await usd.connect(user0_6).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_6).subscribe(owner.address, 1)

    await usd.transfer(user0_1_0.address, "970000000000000000000")
    await usd.connect(user0_1_0).approve(mlm.address, "970000000000000000000")
    await mlm.connect(user0_1_0).subscribe(user0_1.address, 2)

    await usd.transfer(user0_1_1.address, "250000000000000000000")
    await usd.connect(user0_1_1).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_1_1).subscribe(user0_1.address, 0)

    await usd.transfer(user0_1_2.address, "250000000000000000000")
    await usd.connect(user0_1_2).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_1_2).subscribe(user0_1.address, 0)

    await usd.transfer(user0_1_3.address, "250000000000000000000")
    await usd.connect(user0_1_3).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_1_3).subscribe(user0_1.address, 0)

    await usd.transfer(user0_1_4.address, "970000000000000000000")
    await usd.connect(user0_1_4).approve(mlm.address, "970000000000000000000")
    await mlm.connect(user0_1_4).subscribe(user0_1.address, 2)

    await usd.transfer(user0_1_5.address, "970000000000000000000")
    await usd.connect(user0_1_5).approve(mlm.address, "970000000000000000000")
    await mlm.connect(user0_1_5).subscribe(user0_1.address, 2)
    
    await usd.transfer(user0_1_6.address, "550000000000000000000")
    await usd.connect(user0_1_6).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_1_6).subscribe(user0_1.address, 1)

    await usd.transfer(user0_1_7.address, "550000000000000000000")
    await usd.connect(user0_1_7).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_1_7).subscribe(user0_1.address, 1)

    await usd.transfer(user0_1_1_1.address, "550000000000000000000")
    await usd.connect(user0_1_1_1).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_1_1_1).subscribe(user0_1_1.address, 1)

    await usd.transfer(user0_1_1_1_1.address, "250000000000000000000")
    await usd.connect(user0_1_1_1_1).approve(mlm.address, "250000000000000000000")
    await mlm.connect(user0_1_1_1_1).subscribe(user0_1_1_1.address, 0)

    await usd.transfer(user0_1_1_1_1_1.address, "550000000000000000000")
    await usd.connect(user0_1_1_1_1_1).approve(mlm.address, "550000000000000000000")
    await mlm.connect(user0_1_1_1_1_1).subscribe(user0_1_1_1_1.address, 1)

    await magna.addWhitelist(liquidity.address)
    await magna.addWhitelist(trader.address)
    await magna.transfer(liquidity.address, "100000000000000000000000000000000")

    return { owner, user0_1, user0_2, user0_3, user0_4, user0_5, user0_6, user0_1_0, user0_1_1, user0_1_2, user0_1_3, user0_1_4, user0_1_5, user0_1_6, user0_1_7, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, feeTo, referral, mlm, usd, magna, liquidity, trader }
  }
  it("check single buy", async () => {
    const {owner, usd, trader, mlm, liquidity} = await configMLM()

    await usd.approve(trader.address, "100000000000000000000")
    await trader.buy("100000000000000000000")
    // 97500000000000000000 / 1 = 97500000000000000000
    expect(await trader.magnaBalance(owner.address)).to.be.equal("97500000000000000000")
    let reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("97500000000000000000")
    expect(reserves[1]).to.be.equal("99500000000000000000")
    // price = 1.02051282051282051282
    expect(await trader.depositHistoryLength(owner.address)).to.be.equal("1")
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("4900000000000000000000")

    await usd.approve(trader.address, "100000000000000000000")
    await trader.buy("100000000000000000000")
    // 97500000000000000000 / 1.02051282051282051282 = 95540201005025125628
    expect(await trader.magnaBalance(owner.address)).to.be.equal("193040201005025125628")
    reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("193040201005025125628")
    expect(reserves[1]).to.be.equal("199000000000000000000")
    // price = 1.0308733567616816347788328635686
    expect(await trader.depositHistoryLength(owner.address)).to.be.equal("2")
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("4800000000000000000000")
    
    await usd.approve(trader.address, "100000000000000000000")
    await trader.buy("100000000000000000000")
    // 97500000000000000000 / 1.0308733567616816347788328635686 = 94579997979848993712
    expect(await trader.magnaBalance(owner.address)).to.be.equal("287620198984874119340")
    reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("287620198984874119340")
    expect(reserves[1]).to.be.equal("298500000000000000000")
    // price = 1.0378269713098211399045781150028
    expect(await trader.depositHistoryLength(owner.address)).to.be.equal("3")
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("4700000000000000000000")
    
    await usd.approve(trader.address, "200000000000000000000")
    await trader.buy("200000000000000000000")
    // 97500000000000000000 / 1.0378269713098211399045781150028 = 93946296150838280186
    // reserve0 381566495135712399526
    // reserve1 398000000000000000000
    // price = 1.0430685216699717517234593800301
    // 97500000000000000000 / 1.0430685216699717517234593800301 = 93474204210381806416
    expect(await trader.magnaBalance(owner.address)).to.be.equal("475040699346094205942")
    reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("475040699346094205942")
    expect(reserves[1]).to.be.equal("497500000000000000000")
    // price = 1.0472786872468434843249578961793
    expect(await trader.depositHistoryLength(owner.address)).to.be.equal("4")
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("4500000000000000000000")
    
    await usd.approve(trader.address, "550000000000000000000")
    await trader.buy("550000000000000000000")
    // 97500000000000000000 / 1.0472786872468434843249578961793 = 93098428515063688601
    // reserve0 568139127861157894543
    // reserve1 597000000000000000000
    // price = 1.050798951741790857382804269828
    // 97500000000000000000 / 1.050798951741790857382804269828 = 92786540982349907400
    // reserve0 660925668843507801943
    // reserve1 696500000000000000000
    // price = 1.0538250106380955106801835753888
    // 97500000000000000000 / 1.0538250106380955106801835753888 = 92520104396614516424
    // reserve0 753445773240122318367
    // reserve1 796000000000000000000
    // price = 1.0564794816976373129743429903114
    // 97500000000000000000 / 1.0564794816976373129743429903114 = 92287641822753675930
    // reserve0 845733415062875994297
    // reserve1 895500000000000000000
    // price = 1.0588442930724501553097149737508
    // 97500000000000000000 / 1.0588442930724501553097149737508 = 92081527603160702896
    // reserve0 937814942666036697193
    // reserve1 995000000000000000000
    // price = 1.0609769099769263892587169482958
    // 48750000000000000000 / 1.0609769099769263892587169482958 = 45948219552732953756
    expect(await trader.magnaBalance(owner.address)).to.be.equal("983763162218769650949")
    reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("983763162218769650949")
    expect(reserves[1]).to.be.equal("1044750000000000000000")
    // price = 1.0619934148008563786147138529509
    expect(await trader.depositHistoryLength(owner.address)).to.be.equal("5")
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("3950000000000000000000")
  })
  it("check buy limit", async () => {
    const {owner, usd, trader, mlm, liquidity} = await configMLM()
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("5000000000000000000000")
    await usd.approve(trader.address, "3000000000000000000000")
    await trader.buy("3000000000000000000000")
    expect(await trader.magnaBalance(owner.address)).to.be.equal("2753766254664600935013")
    let reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("2753766254664600935013")
    expect(reserves[1]).to.be.equal("2985000000000000000000")
    await time.increase(86400)
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("2000000000000000000000")
    await usd.approve(trader.address, "3000000000000000000000")
    expect(trader.buy("3000000000000000000000")).to.be.revertedWith("Purchase amount exceeds limit")
    await time.increase(86400)
    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("5000000000000000000000")
    await usd.approve(trader.address, "5000000000000000000000")
    await trader.buy("5000000000000000000000")
  })
  it("check sell", async() => {
    const {owner, user0_1, user0_1_1, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, referral, usd, trader, mlm, liquidity} = await configMLM()

    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("5000000000000000000000")
    await usd.approve(trader.address, "5000000000000000000000")
    await trader.buy("5000000000000000000000")
    expect(await trader.magnaBalance(owner.address)).to.be.equal("4543317548125613225026")
    expect(await trader.getPurchaseLimit(user0_1.address)).to.be.equal("5000000000000000000000")
    
    await usd.transfer(user0_1.address, "5000000000000000000000")
    await usd.connect(user0_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1.address)).to.be.equal("4418473189491197019374")
    // let reserves = await liquidity.reserves()
    // expect(reserves[0]).to.be.equal("8961790737616810244400")
    // expect(reserves[1]).to.be.equal("9950000000000000000000")
    // // price = 1.1102691740206803937808259041095
    // // owner purchase amount = 97500000000000000000 * 50 = 4875000000000000000000
    // // reward = 1.1102691740206803937808259041095 * 4543317548125613225026 - 4875000000000000000000 = 169305421471087439559 // $169
    // // owner receive = 4875000000000000000000 + 169305421471087439559 * 0.65 = 4875000000000000000000 + 110048523956206835713 = 4985048523956206835713
    // // referral reward = 110048523956206835713 * 0.06 = 6602911437372410142
    // // trader reward = 169305421471087439559 - 110048523956206835713 - 6602911437372410142 = 52653986077508193704
    // expect(await usd.balanceOf(owner.address)).to.be.equal("999979800000000000000000000")
    // await trader.connect(owner).sell("4543317548125613225026")
    // expect(await usd.balanceOf(owner.address)).to.be.equal("999984785048523956206835713")
    // expect(await usd.balanceOf(referral)).to.be.equal("6602911437372410142")
    // expect(await usd.balanceOf(trader.address)).to.be.equal("52653986077508193704")
        
    await usd.transfer(user0_1_1_1_1_1.address, "5000000000000000000000")
    await usd.connect(user0_1_1_1_1_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1_1_1_1_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1_1_1_1_1.address)).to.be.equal("4372218563192676712198")
        
    await usd.transfer(user0_1_1_1_1.address, "5000000000000000000000")
    await usd.connect(user0_1_1_1_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1_1_1_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1_1_1_1.address)).to.be.equal("4342449852929547604894")

    let reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("17676459153739034561492")
    expect(reserves[1]).to.be.equal("19900000000000000000000")
    // price = 1.1257910776656097582523455045319
    // user0_1_1_1_1_1 purchase amount = 97500000000000000000 * 50 = 4875000000000000000000
    // reward = 1.1257910776656097582523455045319 * 4372218563192676712198 - 4875000000000000000000 = 47204648046267415211 // $47
    // user0_1_1_1_1_1 receive = 4875000000000000000000 + 47204648046267415211 * 0.65 = 4875000000000000000000 + 30683021230073819887 = 4905683021230073819887
    // user0_1_1_1_1 reward = 30683021230073819887 * 0.06 = 1840981273804429193
    // user0_1_1_1 reward = 30683021230073819887 * 0.03 = 920490636902214596
    // user0_1_1 reward = 0 // subscription level 1, depth 3 > 1
    // user0_1 reward = 0 // subscription level 2, depth 4 > 3
    // owner reward = 30683021230073819887 * 0.02 = 613660424601476397
    // trader reward = 47204648046267415211 - 30683021230073819887 - 1840981273804429193 - 920490636902214596 - 613660424601476397 = 13146494480885475138
    expect(await usd.balanceOf(user0_1_1_1_1_1.address)).to.be.equal("0")
    await trader.connect(user0_1_1_1_1_1).sell("4372218563192676712198")
    expect(await usd.balanceOf(user0_1_1_1_1_1.address)).to.be.equal("4905683021230073819887")
    expect(await usd.balanceOf(user0_1_1_1_1.address)).to.be.equal("1840981273804429193")
    expect(await usd.balanceOf(user0_1_1_1.address)).to.be.equal("920490636902214596")
    expect(await usd.balanceOf(user0_1_1.address)).to.be.equal("0")
    expect(await usd.balanceOf(user0_1.address)).to.be.equal("0")
    expect(await usd.balanceOf(owner.address)).to.be.equal("999969800613660424601476397")
    expect(await usd.balanceOf(trader.address)).to.be.equal("13146494480885475138")
  })
  it("check success reward", async () => {
    const {owner, user0_1, user0_2, user0_3, user0_4, user0_5, user0_6, user0_1_1, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, referral, usd, trader, mlm, liquidity} = await configMLM()

    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("5000000000000000000000")

    await usd.approve(trader.address, "5000000000000000000000")
    await trader.buy("5000000000000000000000")
    expect(await trader.magnaBalance(owner.address)).to.be.equal("4543317548125613225026")
    expect(await trader.getPurchaseLimit(user0_1.address)).to.be.equal("5000000000000000000000")
    
    await usd.transfer(user0_1_1_1_1_1.address, "5000000000000000000000")
    await usd.connect(user0_1_1_1_1_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1_1_1_1_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1_1_1_1_1.address)).to.be.equal("4418473189491197019374")
    
    await usd.transfer(user0_2.address, "5000000000000000000000")
    await usd.connect(user0_2).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_2).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_2.address)).to.be.equal("4372218563192676712198")
    
    await usd.transfer(user0_3.address, "5000000000000000000000")
    await usd.connect(user0_3).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_3).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_3.address)).to.be.equal("4342449852929547604894")
    
    await usd.transfer(user0_4.address, "5000000000000000000000")
    await usd.connect(user0_4).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_4).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_4.address)).to.be.equal("4320447809589717140280")
    
    await usd.transfer(user0_5.address, "5000000000000000000000")
    await usd.connect(user0_5).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_5).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_5.address)).to.be.equal("4302994974308931985366")
    
    await usd.transfer(user0_6.address, "5000000000000000000000")
    await usd.connect(user0_6).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_6).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_6.address)).to.be.equal("4288535292799039123019")

    let reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("30588437230436722810157")
    expect(reserves[1]).to.be.equal("34825000000000000000000")
    // price = 1.1385020992621266439194481298418
    // user0_1_1_1_1_1 purchase amount = 97500000000000000000 * 50 = 4875000000000000000000
    // reward = 1.1385020992621266439194481298418 * 4418473189491197019374 - 4875000000000000000000 = 155441001769152096989 // $155
    // user0_1_1_1_1_1 receive = 4875000000000000000000 + 155441001769152096989 * 0.65 = 4875000000000000000000 + 101036651149948863042 = 4976036651149948863042
    // user0_1_1_1_1 reward = 101036651149948863042 * 0.06 = 6062199068996931782
    // user0_1_1_1 reward = 101036651149948863042 * 0.03 = 3031099534498465891
    // user0_1_1 reward = 0 // subscription level 1, depth 3 > 1
    // user0_1 reward = 0 // subscription level 2, depth 4 > 3
    // owner reward = 101036651149948863042 * 0.02 + 101036651149948863042 * 0.06 = 8082932091995909042
    // trader reward = 155441001769152096989 - 101036651149948863042 - 6062199068996931782 - 3031099534498465891 - 8082932091995909042 = 37228119923711927232
    expect(await usd.balanceOf(user0_1_1_1_1_1.address)).to.be.equal("0")
    await trader.connect(user0_1_1_1_1_1).sell("4418473189491197019374")
    expect(await usd.balanceOf(user0_1_1_1_1_1.address)).to.be.equal("4976036651149948863042")
    expect(await usd.balanceOf(user0_1_1_1_1.address)).to.be.equal("6062199068996931782")
    expect(await usd.balanceOf(user0_1_1_1.address)).to.be.equal("3031099534498465891")
    expect(await usd.balanceOf(user0_1_1.address)).to.be.equal("0")
    expect(await usd.balanceOf(user0_1.address)).to.be.equal("0")
    expect(await usd.balanceOf(owner.address)).to.be.equal("999954808082932091995909042")
    expect(await usd.balanceOf(trader.address)).to.be.equal("37228119923711927232")
  })
  it("check autoWithdraw", async () => {
    const {owner, user0_1, user0_1_1, user0_1_1_1, user0_1_1_1_1, user0_1_1_1_1_1, feeTo, referral, usd, trader, mlm, liquidity} = await configMLM()

    expect(await trader.getPurchaseLimit(owner.address)).to.be.equal("5000000000000000000000")
    await usd.approve(trader.address, "5000000000000000000000")
    await trader.buy("5000000000000000000000")
    expect(await trader.magnaBalance(owner.address)).to.be.equal("4543317548125613225026")
    expect(await trader.getPurchaseLimit(user0_1.address)).to.be.equal("5000000000000000000000")
    
    await usd.transfer(user0_1.address, "5000000000000000000000")
    await usd.connect(user0_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1.address)).to.be.equal("4418473189491197019374")
        
    await usd.transfer(user0_1_1_1_1_1.address, "5000000000000000000000")
    await usd.connect(user0_1_1_1_1_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1_1_1_1_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1_1_1_1_1.address)).to.be.equal("4372218563192676712198")
        
    await usd.transfer(user0_1_1_1_1.address, "5000000000000000000000")
    await usd.connect(user0_1_1_1_1).approve(trader.address, "5000000000000000000000")
    await trader.connect(user0_1_1_1_1).buy("5000000000000000000000")
    expect(await trader.magnaBalance(user0_1_1_1_1.address)).to.be.equal("4342449852929547604894")

    let reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("17676459153739034561492")
    expect(reserves[1]).to.be.equal("19900000000000000000000")

    expect(trader.autoWithdraw(user0_1.address)).to.be.revertedWith("Can't withdraw now")
    await time.increase(30 * 86400)
    await trader.autoWithdraw(user0_1.address)
    // await trader.connect(user0_1).sell("4418473189491197019374")
    // price = 1.1257910776656097582523455045319
    // owner purchase amount = 97500000000000000000 * 50 = 4875000000000000000000
    // reward = 1.1257910776656097582523455045319 * 4418473189491197019374 - 4875000000000000000000 = 99277693633898645961 // $99
    // user0_1 receive = 4875000000000000000000 + 99277693633898645961 * 0.65 = 4875000000000000000000 + 64530500862034119874 = 4939530500862034119874
    // owner reward = 64530500862034119874 * 0.06 = 3871830051722047192 
    // referral reward = 64530500862034119874 * 0.03 = 1935915025861023596 
    // trader reward = 99277693633898645961 - 64530500862034119874 - 3871830051722047192 - 1935915025861023596 = 28939447694281455299
    // auto buy
    // 17489352624937473579351, 19801222306366101354039
    // deposit net amount = 38542238340483266877 magna amount = 34042282181458067890 deposit amount = 39332848357723949274
    // next reserve 17523394907118931647241 19840555154723825303313
    expect(await usd.balanceOf(referral)).to.be.equal("1935915025861023596")
    expect(await usd.balanceOf(trader.address)).to.be.equal("28939447694281455299")

    reserves = await liquidity.reserves()
    expect(reserves[0]).to.be.equal("17523394907118931647241")
    expect(reserves[1]).to.be.equal("19840555154723825303313")
    expect(await trader.magnaBalance(user0_1.address)).to.be.equal("4265408942871094105123")

    await trader.setFeeTo(feeTo.address)
    await trader.withdrawRewards()
  })
  it("check trader and liquidity config changable", async () => {
    const {trader} = await configMLM()
    await trader.setWithdrawProfitFee("30000")
    expect(await trader.withdrawProfitFee()).to.be.equal("30000")
    await trader.setWithdrawProfitDistribution(["5000","4000","3000","2000","1000"])
    console.log(await trader.withdrawProfitDistribution())
    await trader.setSuccessReward("5000")
    console.log(await trader.successRewardRequirement())
    await trader.setSuccessRewardRequirement("7", "5000000000000000000000")
    console.log(await trader.successRewardRequirement())
    await trader.setPurchaseCooldown("86400")
    expect(await trader.purchaseCooldown()).to.be.equal("86400")
    await trader.setMaxPurchase("4000000000000000000000")
    expect(await trader.maxPurchase()).to.be.equal("4000000000000000000000")
    await trader.setMaxAmountPerBuy("200000000000000000000")
    expect(await trader.maxAmountPerBuy()).to.be.equal("200000000000000000000")
  })
  // it ("console.", async () => {
  //   let reserve0 = ethers.BigNumber.from("13257985964247837542118")
  //   let reserve1 = ethers.BigNumber.from("14925722306366101354039")
  //   for (let i = 0; i < 50; i++) {
  //     let amount
  //     // if (i == 0) {
  //     //   amount = ethers.BigNumber.from("97500000000000000000")
  //     // } else {
  //       amount = ethers.BigNumber.from("97500000000000000000").mul(reserve0).div(reserve1)
  //     // }
  //     reserve0 = reserve0.add(amount)
  //     reserve1 = reserve1.add(ethers.BigNumber.from("99500000000000000000"))
  //     let price = reserve1.mul("1000000000000000000000000000000").div(reserve0)
  //     console.log(`100000000000000000000,2000000000000000000,500000000000000000,97500000000000000000,${amount.toString()},${reserve0.toString()},${reserve1.toString()},${price.toString()}`)
  //   }
  // })
})
