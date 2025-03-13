#!/usr/bin/env node

import { execSync } from "child_process";
import { program } from "commander";
import fs from "fs-extra";
import os from "os";
import path from "path";

const tempDir = path.join(os.tmpdir(), "primevue-volt-temp");

interface CommandOptions {
    srcDir: boolean;
}

program.name("voltui");
program.description("Add PrimeVue Volt components to your project");
program.version("0.0.1", "-v, --version", "Output the current version");
program.option("--verbose", "Show detailed error messages");

program
    .command("add")
    .description("Add the specified Volt component to your project")
    .option("--no-src-dir", "Install to root directory instead of src directory")
    .argument("<component>", 'Component name or "all" for all components')
    .action(async (component: string, options: CommandOptions) => {
        const verbose = program.opts().verbose;

        if (verbose) {
            console.log("🔍 Verbose mode enabled. Showing detailed information.");
            console.log(`📌 Component: ${component}`);
            console.log(`📌 Options: ${JSON.stringify(options)}`);
            console.log(`📌 Temporary directory: ${tempDir}`);
        }

        try {
            fs.removeSync(tempDir);
            fs.ensureDirSync(tempDir);

            execSync(`git clone --depth 1 https://github.com/primefaces/primevue.git ${tempDir}`);

            const baseDir = options.srcDir ? path.join(process.cwd(), "src") : process.cwd();
            const voltDir = path.join(baseDir, "volt");

            if (component === "all") {
                const voltSourceDir = path.join(tempDir, "apps", "volt", "volt");
                const targetDir = voltDir;

                if (!fs.existsSync(voltSourceDir)) {
                    console.error("❌ Volt components directory not found!");

                    return;
                }

                fs.ensureDirSync(targetDir);
                fs.copySync(voltSourceDir, targetDir);

                console.log(`✅ All Volt components successfully added to: ${targetDir}`);
            } else {
                const voltComponentDir = path.join(tempDir, "apps", "volt", "volt", component);
                const voltUtilsDir = path.join(tempDir, "apps", "volt", "volt", "utils");
                const targetComponentDir = path.join(voltDir, component);
                const targetUtilsDir = path.join(voltDir, "utils");

                if (!fs.existsSync(voltComponentDir)) {
                    console.error(`❌ Component ${component} not found!`);

                    return;
                }

                if (!fs.existsSync(voltUtilsDir)) {
                    console.warn(`⚠️ Utils folder not found in the repository.`);
                }

                fs.ensureDirSync(voltDir);
                fs.copySync(voltComponentDir, targetComponentDir);
                fs.copySync(voltUtilsDir, targetUtilsDir);

                console.log(`✅ Component ${component} and utils successfully added.`);
            }

            fs.removeSync(tempDir);
        } catch (error) {
            if (error instanceof Error) {
                console.error(`❌ Error occurred: ${error.message}`);
            } else {
                console.error(`❌ Unknown error occurred`);
            }

            fs.removeSync(tempDir);
        }
    });

// Handle unknown commands
program.on("command:*", () => {
    console.error("❌ Invalid command: %s", program.args.join(" "));
    console.log("");
    console.log("Available commands:");
    console.log("  add <component>               - Add a component to your project");
    console.log("");
    console.log("Examples:");
    console.log("  voltui add button               - Add button component to src/volt");
    console.log("  voltui add --no-src-dir button  - Add button component to root/volt");
    console.log("  voltui add all                  - Add all components to src/volt");
    process.exit(1);
});

// Show help if no arguments provided
if (process.argv.length === 2) {
    program.outputHelp();
    process.exit(1);
}

program.parse(process.argv);

// Handle unhandled promise rejections
process.on("unhandledRejection", function (err: Error) {
    const debug = program.opts().verbose;

    if (debug && err instanceof Error) {
        console.error(err.stack);
    }

    console.error("❌ Unhandled error occurred");
    fs.removeSync(tempDir);
    process.exit(1);
});
