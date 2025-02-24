import { config } from "dotenv";
import { ethers } from "ethers";
import solc from "solc";
import chalk from "chalk";
import ora from "ora";
import cfonts from "cfonts";
import readlineSync from "readline-sync";
import fs from "fs";

// Muat file .env
config({ path: '.env' });

// Muat konfigurasi dari config.json
let configData;
try {
    const configFile = fs.readFileSync("config.json", "utf8");
    configData = JSON.parse(configFile);
} catch (error) {
    console.log(chalk.red.bold("❌ Gagal memuat config.json!"));
    console.error(error);
    process.exit(1);
}

// Fungsi untuk membaca kunci privat dari file .env
function readPrivateKeysFromEnv(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const privateKeys = data.split('\n')
            .map(line => line.trim())
            .filter(line => line !== ''); // Hilangkan baris kosong
        return privateKeys;
    } catch (error) {
        console.error("Kesalahan membaca kunci privat dari .env:", error);
        return [];
    }
}

// Fungsi untuk mengkompilasi kontrak Solidity
function compileContract(source, contractPath) {
    const spinner = ora("Mengkompilasi kontrak...").start();
    try {
        const input = {
            language: "Solidity",
            sources: {
                [contractPath]: {
                    content: source
                }
            },
            settings: {
                outputSelection: {
                    "*": {
                        "*": ["abi", "evm.bytecode"]
                    }
                }
            }
        };
        const output = JSON.parse(solc.compile(JSON.stringify(input)));

        // Ekstrak nama kontrak dari output kompilasi
        let contractName = null;
        if (output.contracts && output.contracts[contractPath]) {
            const contractNames = Object.keys(output.contracts[contractPath]);
            if (contractNames.length > 0) {
                contractName = contractNames[0];
            }
        }

        if (!contractName) {
            throw new Error("Nama kontrak tidak ditemukan dalam output kompilasi.");
        }

        const contract = output.contracts[contractPath][contractName];
        spinner.succeed(chalk.green("Kontrak berhasil dikompilasi!"));
        return {
            abi: contract.abi,
            bytecode: contract.evm.bytecode.object,
            contractName
        };
    } catch (error) {
        spinner.fail(chalk.red("Kompilasi kontrak gagal!"));
        console.error(error);
        process.exit(1);
    }
}

// Fungsi untuk memuat kode sumber kontrak
function loadContractSource(contractPath) {
    try {
        return fs.readFileSync(contractPath, "utf8");
    } catch (error) {
        console.log(chalk.red.bold("❌ Gagal memuat kode sumber kontrak!"));
        process.exit(1);
    }
}

// Fungsi utama untuk melakukan deployment kontrak
async function deploy(selectedConfig, abi, constructorArgs) {
    // Baca kunci privat dari file .env
    const privateKeys = readPrivateKeysFromEnv('.env');

    // Gunakan jumlah kunci privat sebagai jumlah deployment
    const numDeployments = privateKeys.length;

    if (numDeployments === 0) {
        console.log(chalk.red.bold("❌ Tidak ada kunci privat yang ditemukan di .env!"));
        return false; // Keluar dari fungsi deployment
    }

    console.log(chalk.blue.bold(`\n🚀 Melakukan deployment dengan ${numDeployments} akun menggunakan konfigurasi: ${selectedConfig.name}...\n`));

    const contractSourceCode = loadContractSource(selectedConfig.CONTRACT_PATH);
    const {
        bytecode,
        contractName
    } = compileContract(contractSourceCode, selectedConfig.CONTRACT_PATH);
    let contractAddresses = [];

    for (let i = 0; i < numDeployments; i++) {
        const PRIVATE_KEY = privateKeys[i];

        if (!PRIVATE_KEY) {
            console.log(chalk.red.bold(`❌ Kunci privat ${i + 1} tidak ditemukan di .env!`));
            continue; // Lanjutkan ke akun berikutnya
        }

        const provider = new ethers.JsonRpcProvider(selectedConfig.RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

        const spinner = ora(`Melakukan deployment kontrak ${i + 1}/${numDeployments} dengan akun ${wallet.address}...`).start();
        try {
            const factory = new ethers.ContractFactory(abi, bytecode, wallet);

            let contract;
            const overrides = {
                 gasLimit: 3000000, // Contoh batas gas, sesuaikan sesuai kebutuhan
            };

            console.log("Argumen Konstruktor:", constructorArgs); // Periksa argumen

            // Tangani kasus dengan dan tanpa argumen konstruktor dengan benar
            if (constructorArgs.length > 0) {
                contract = await factory.deploy(...constructorArgs, overrides);
            } else {
                contract = await factory.deploy(overrides); // Hanya berikan overrides jika tidak ada argumen konstruktor
            }

            console.log("⏳ Menunggu konfirmasi transaksi...");
            const txReceipt = await contract.deploymentTransaction().wait();

            spinner.succeed(chalk.green(`Kontrak ${i + 1} berhasil di-deploy dengan akun ${wallet.address}!`));
            console.log(chalk.cyan.bold(`📌 Alamat Kontrak ${i + 1}: `) + chalk.yellow(contract.target));
            console.log(chalk.cyan.bold(`📜 Hash Transaksi ${i + 1}: `) + chalk.yellow(txReceipt.hash));

            contractAddresses.push(contract.target);
        } catch (error) {
            spinner.fail(chalk.red(`Deployment ${i + 1} gagal!`));
            console.error(error);
        }
    }

    fs.appendFileSync("hasilDeploy.txt", `\nDEPLOYED_CONTRACTS_${selectedConfig.CHAIN_ID}=${contractAddresses.join(",")}`);
    console.log(chalk.green("\n✅ Semua deployment selesai! 🎉\n"));
    return true; // Menandakan deployment berhasil
}

// Fungsi utama program
async function main() {
    cfonts.say("NT Exhaust", {
        font: "block",
        align: "center",
        colors: ["cyan", "magenta"],
        background: "black",
        letterSpacing: 1,
        lineHeight: 1,
        space: true,
        maxLength: "0",
    });

    console.log(chalk.blue.bold("=== Telegram Channel : NT Exhaust (@NTExhaust) ==="));

    const waitTimeMinutes = 5; // Atur waktu tunggu menjadi 5 menit
    const waitTimeMilliseconds = waitTimeMinutes * 60 * 1000;

    let selectedConfig = null; // Simpan konfigurasi yang dipilih
    let abi = null; // Simpan ABI
    let constructorArgs = []; // Simpan argumen konstruktor

    // Pemilihan konfigurasi awal
    console.log(chalk.yellow.bold("\nKonfigurasi yang Tersedia:\n"));
    configData.forEach((config, index) => {
        console.log(chalk.cyan(`${index + 1}. ${config.name}`));
    });
    console.log(chalk.cyan("0. Keluar")); // Tambahkan opsi keluar

    let selectedIndex = readlineSync.question(chalk.green("\nMasukkan nomor konfigurasi yang ingin digunakan: "));
    selectedIndex = parseInt(selectedIndex);

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex > configData.length) {
        console.log(chalk.red.bold("❌ Pilihan tidak valid!"));
        process.exit(1); // Keluar jika pilihan awal tidak valid
    }

    if (selectedIndex === 0) {
        console.log(chalk.green("Keluar..."));
        process.exit(0); // Keluar segera
    }

    selectedConfig = configData[selectedIndex - 1]; // Simpan konfigurasi yang dipilih
    constructorArgs = selectedConfig.CONSTRUCTOR_ARGS || []; // AMBIL argumen dari config.json

    const contractSourceCode = loadContractSource(selectedConfig.CONTRACT_PATH);
    const {
        abi: compiledAbi,
        bytecode,
        contractName
    } = compileContract(contractSourceCode, selectedConfig.CONTRACT_PATH);
    abi = compiledAbi; // Simpan ABI

    // **HAPUS BARIS INI:** Tidak lagi memerlukan input pengguna
    // let input = readlineSync.question("Masukkan argumen konstruktor (dipisahkan koma, atau kosongkan jika tidak ada): ");
    // constructorArgs = input ? input.split(",").map(arg => arg.trim()) : [];

    while (true) {
        const deploymentSuccessful = await deploy(selectedConfig, abi, constructorArgs);

        if (deploymentSuccessful) {
            console.log(chalk.blue(`\nMenunggu selama ${waitTimeMinutes} menit sebelum deployment berikutnya...\n`));
            await new Promise(resolve => setTimeout(resolve, waitTimeMilliseconds));
        } else {
            console.log(chalk.red.bold("\n❌ Deployment gagal. Silakan periksa konfigurasi dan kunci privat Anda.\n"));
            process.exit(1); // Keluar jika deployment gagal
        }
    }
}

main().catch(console.error);
