import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import hre from "hardhat"

const main = async function () {
  deployFunction(hre)
}

const deployFunction: DeployFunction = async function ({
  deployments,
  getChainId,
  getNamedAccounts,
  ethers
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments
  const chainId = parseInt(await getChainId())
  const { deployer } = await getNamedAccounts()
  console.log(chainId, deployer)

  const latestBlock = await hre.ethers.provider.getBlock("latest")
  
  const result1 = await deploy("MagnaToken", {
    from: deployer,
    args: ["0x426De8F8Ad29029Cfcee1b920751417d69A84000", "0xCB7359B8adde4e2bbf5ED4716B9360B315be8F39"],
    log: true,
    deterministicDeployment: false,
  })

  console.log(`Magna Token is deployed to ${result1.address}`)
}

deployFunction.dependencies = []

deployFunction.tags = ["Lock"]

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
