import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Test MAGNA contract", () => {

  async function beforeTest() {
    // get users
    const [owner, user, guaranteeAddr, treasuryAddr, newGuaranteeAddr, newTreasuryAddr] = await ethers.getSigners()
  
    const magnaContract = await ethers.getContractFactory("MagnaToken")
    const magna = await magnaContract.deploy(guaranteeAddr.address, treasuryAddr.address)

    return {owner, user, guaranteeAddr, treasuryAddr, newGuaranteeAddr, newTreasuryAddr, magna}
  }

  describe('check config', () => {
    it("token name is Magna Token", async () => {
      const {magna} = await beforeTest()
      expect(await magna.name()).to.equal("Magna Token")
    })
    it("token symbol is MAGNA", async () => {
      const {magna} = await beforeTest()
      expect(await magna.symbol()).to.equal("MAGNA")
    })
    it("token decimal is 18", async () => {
      const {magna} = await beforeTest()
      expect(await magna.decimals()).to.equal(18)
    })
    it("check token fee setting", async () => {
      const {magna} = await beforeTest()
      expect(await magna.guaranteeFee()).to.equal(7)
      expect(await magna.treasuryFee()).to.equal(18)
      expect(await magna.feeDenominator()).to.equal(1000)
    })
    it("check fee receivers", async () => {
      const {magna, guaranteeAddr, treasuryAddr} = await beforeTest()
      expect(await magna.guaranteeAddr()).to.equal(guaranteeAddr.address)
      expect(await magna.treasuryAddr()).to.equal(treasuryAddr.address)
    })
  })

  describe('check update config', () => {
    it("update token fee setting", async () => {
      const {magna, owner, user} = await beforeTest()
      expect(magna.connect(user).setFee(8, 17, 100)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).setFee(8, 17, 100)).not.to.be.reverted
      expect(await magna.guaranteeFee()).to.equal(8)
      expect(await magna.treasuryFee()).to.equal(17)
      expect(await magna.feeDenominator()).to.equal(100)
    })
    it("update token fee receivers setting", async () => {
      const {magna, owner, user, newGuaranteeAddr, newTreasuryAddr} = await beforeTest()
      expect(magna.connect(user).setGuaranteeAddr(newGuaranteeAddr.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).setGuaranteeAddr(newGuaranteeAddr.address)).not.to.be.reverted
      expect(await magna.guaranteeAddr()).to.equal(newGuaranteeAddr.address)
      expect(magna.connect(user).setTreasuryAddr(newTreasuryAddr.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).setTreasuryAddr(newTreasuryAddr.address)).not.to.be.reverted
      expect(await magna.treasuryAddr()).to.equal(newTreasuryAddr.address)
    })
  })

  describe("check whitelist", () => {
    it("check whitelist", async() => {
      const {magna, owner, user} = await beforeTest()
      expect(magna.connect(user).addWhitelist(magna.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).addWhitelist(magna.address)).not.to.be.reverted
      expect(magna.addWhitelist(magna.address)).to.be.revertedWith("Whitelist: already added")
      expect(magna.connect(user).removeWhitelist(magna.address)).to.be.revertedWith("Ownable: caller is not the owner")
      expect(await magna.connect(owner).removeWhitelist(magna.address)).not.to.be.reverted
      expect(magna.removeWhitelist(magna.address)).to.be.revertedWith("Whitelist: already removed")
    })
  })

  describe("check transfer", () => {
    it("check transfer to another wallet", async() => {
      const {magna, user, guaranteeAddr, treasuryAddr} = await beforeTest()
      expect(await magna.transfer(user.address, "1000000000000000000")).not.to.be.reverted
      expect(await magna.balanceOf(user.address)).to.equal("975000000000000000")
      expect(await magna.balanceOf(guaranteeAddr.address)).to.equal("7000000000000000")
      expect(await magna.balanceOf(treasuryAddr.address)).to.equal("18000000000000000")
    })
    it("check transfer to contract", async() => {
      const {magna, guaranteeAddr, treasuryAddr} = await beforeTest()
      expect(magna.transfer(magna.address, "1000000000000000000")).to.be.revertedWith("ERC20: transfer from the unregistered contract")
      expect(await magna.addWhitelist(magna.address)).not.to.be.reverted
      expect(magna.transfer(magna.address, "1000000000000000000")).not.to.be.reverted
      expect(await magna.balanceOf(magna.address)).to.equal("975000000000000000")
      expect(await magna.balanceOf(guaranteeAddr.address)).to.equal("7000000000000000")
      expect(await magna.balanceOf(treasuryAddr.address)).to.equal("18000000000000000")
    })
  })
});
